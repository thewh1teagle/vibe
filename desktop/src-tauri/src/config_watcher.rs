//! Watches `app_config.json` so edits made outside the app (by a person or an agent) take effect
//! immediately instead of on next launch. `tauri-plugin-store` never re-reads the file on its own.

use crate::config::STORE_FILENAME;
use eyre::{eyre, Result};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::{Map, Value};
use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;

/// Event emitted after the store was refreshed from an external edit. The plugin's own
/// `store://change` events are not emitted by `reload*()`, so the frontend needs this one.
pub const CONFIG_CHANGED_EVENT: &str = "config-changed";

/// Editors and agents write in bursts (truncate + write, or write + rename); coalesce them.
const DEBOUNCE: Duration = Duration::from_millis(200);

/// Holds the watcher alive in Tauri state; dropping it stops the watch.
pub struct ConfigWatcher {
    _watcher: RecommendedWatcher,
}

/// Reload the store from disk and tell the webviews, but only if disk really differs from what the
/// app already holds.
///
/// This doubles as the self-write filter: every write the app performs (our atomic command, or the
/// plugin's own `save()`) leaves disk equal to the in-memory cache, so the resulting filesystem
/// event compares equal here and is dropped. Comparing state rather than tracking a "we are
/// writing" flag needs no coordination with the plugin and cannot get stuck if a write panics.
fn reload_if_externally_changed(app: &AppHandle, path: &Path) -> Result<()> {
    let contents = std::fs::read_to_string(path)?;
    let on_disk: Map<String, Value> = serde_json::from_str(&contents)?;

    let store = app.store(STORE_FILENAME).map_err(|e| eyre!("{:?}", e))?;
    let in_memory: Map<String, Value> = store.entries().into_iter().collect();
    if on_disk == in_memory {
        return Ok(());
    }

    // `reload()` merges disk into the cache, which would keep keys the external editor deleted.
    // The store is created without defaults, so ignoring defaults simply mirrors the file.
    store.reload_ignore_defaults().map_err(|e| eyre!("{:?}", e))?;
    tracing::info!("reloaded {} after an external edit", STORE_FILENAME);

    app.emit(CONFIG_CHANGED_EVENT, Value::Object(on_disk))?;
    Ok(())
}

/// Reload the store from disk unconditionally (used right after the app writes the file itself).
pub fn sync_store_from_disk(app: &AppHandle) -> Result<()> {
    let store = app.store(STORE_FILENAME).map_err(|e| eyre!("{:?}", e))?;
    store.reload_ignore_defaults().map_err(|e| eyre!("{:?}", e))?;
    Ok(())
}

/// Start watching the config file. The returned watcher must be kept alive.
pub fn start(app: &AppHandle) -> Result<ConfigWatcher> {
    let config_dir = app.path().app_config_dir()?;
    let config_path = config_dir.join(STORE_FILENAME);

    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
    let mut watcher = notify::recommended_watcher(move |res| {
        // The receiver is dropped only on shutdown; a send failure then is not worth logging.
        let _ = tx.send(res);
    })?;

    // Watch the directory, not the file: an atomic save replaces the file by rename, and a watch
    // registered on the old inode would stop firing after the first such save.
    watcher.watch(&config_dir, RecursiveMode::NonRecursive)?;

    let app = app.clone();
    let watched_path = config_path.clone();
    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut touched = event_touches_config(&first);
            // Drain the rest of the burst before acting on it.
            while let Ok(next) = rx.recv_timeout(DEBOUNCE) {
                touched |= event_touches_config(&next);
            }
            if !touched || !watched_path.exists() {
                continue;
            }
            if let Err(error) = reload_if_externally_changed(&app, &watched_path) {
                // A partially written file is normal mid-burst; the next event settles it.
                tracing::warn!("could not apply external config change: {:?}", error);
            }
        }
        tracing::debug!("config watcher stopped");
    });

    tracing::debug!("watching {} for external edits", config_path.display());
    Ok(ConfigWatcher { _watcher: watcher })
}

/// Match on the file name rather than the full path: platform backends can report the watched
/// directory through a resolved/aliased prefix, and the app config dir holds other files too.
fn event_touches_config(event: &notify::Result<Event>) -> bool {
    match event {
        Ok(event) => event
            .paths
            .iter()
            .any(|path| path.file_name().is_some_and(|name| name == STORE_FILENAME)),
        Err(error) => {
            tracing::warn!("config watcher error: {:?}", error);
            false
        }
    }
}
