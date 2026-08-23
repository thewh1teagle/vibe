use crate::config::STORE_FILENAME;
use eyre::{eyre, Context, Result};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

/// Config key holding the base URL of the running local API. Must match `CONFIG_KEYS.apiBaseUrl`.
pub const API_BASE_URL_KEY: &str = "api.baseUrl";

/// Absolute path of `app_config.json`, so the UI (and agents told where to look) can find it.
#[tauri::command]
pub fn get_config_path(app_handle: tauri::AppHandle) -> Result<PathBuf> {
    Ok(app_handle.path().app_config_dir()?.join(STORE_FILENAME))
}

/// Publish (or clear) the local API's base URL in the config file.
///
/// The port is picked per run and lives in memory only, so an agent outside the app has no way to
/// find it. Writing it where the skill already points solves that; clearing it on stop and on exit
/// keeps a dead port from outliving the server it belonged to.
pub fn set_api_base_url(app_handle: &tauri::AppHandle, base_url: Option<&str>) -> Result<()> {
    let store = app_handle.store(STORE_FILENAME).map_err(|e| eyre!("{:?}", e))?;
    match base_url {
        Some(url) => store.set(API_BASE_URL_KEY, serde_json::Value::String(url.to_string())),
        None => {
            store.delete(API_BASE_URL_KEY);
        }
    }
    store.save().map_err(|e| eyre!("{:?}", e))?;
    Ok(())
}

/// Write the whole config file in a way that never leaves a truncated file behind.
///
/// `tauri-plugin-store` saves with a plain `fs::write`, which truncates first: a crash or an
/// external writer reading mid-save sees half a file. Writing to a sibling temp file, fsyncing it
/// and renaming over the target makes the swap atomic for any reader (same directory, so the
/// rename never crosses a filesystem boundary).
#[tauri::command]
pub fn write_config_atomically(app_handle: tauri::AppHandle, contents: String) -> Result<()> {
    // Reject invalid JSON here rather than letting the store fail to parse it on next load.
    serde_json::from_str::<serde_json::Value>(&contents).context("config contents are not valid JSON")?;

    let config_dir = app_handle.path().app_config_dir()?;
    fs::create_dir_all(&config_dir).context("create app config directory")?;
    let path = config_dir.join(STORE_FILENAME);
    let tmp_path = config_dir.join(format!("{STORE_FILENAME}.tmp"));

    {
        let mut file = fs::File::create(&tmp_path).context("create temporary config file")?;
        file.write_all(contents.as_bytes()).context("write temporary config file")?;
        // fsync before the rename, otherwise the rename can land while the data is still in cache.
        file.sync_all().context("sync temporary config file")?;
    }

    fs::rename(&tmp_path, &path).context("rename temporary config file over the config file")?;
    tracing::debug!("wrote config atomically to {}", path.display());

    // Keep the plugin's in-memory cache in sync with what we just put on disk, so a later
    // `store.save()` cannot resurrect stale values on top of this write.
    crate::config_watcher::sync_store_from_disk(&app_handle)?;
    Ok(())
}
