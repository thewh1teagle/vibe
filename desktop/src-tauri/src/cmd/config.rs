use crate::config::STORE_FILENAME;
use eyre::{Context, Result};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

/// Absolute path of `app_config.json`, so the UI (and agents told where to look) can find it.
#[tauri::command]
pub fn get_config_path(app_handle: tauri::AppHandle) -> Result<PathBuf> {
    Ok(app_handle.path().app_config_dir()?.join(STORE_FILENAME))
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
