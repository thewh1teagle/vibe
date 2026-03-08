use crate::config::STORE_FILENAME;
use crate::ffmpeg;
use eyre::{Context, Result};

/// Return true if there's internet connection
/// timeout in ms
#[tauri::command]
pub async fn is_online(timeout: Option<u64>) -> Result<bool> {
    let timeout = std::time::Duration::from_millis(timeout.unwrap_or(2000));
    let targets = ["1.1.1.1:80", "1.1.1.1:53", "8.8.8.8:53", "8.8.8.8:80"];

    let tasks = targets.iter().map(|addr| async move {
        tokio::time::timeout(timeout, tokio::net::TcpStream::connect(addr))
            .await
            .map(|res| res.is_ok())
            .unwrap_or(false)
    });

    Ok(futures::future::join_all(tasks).await.into_iter().any(|res| res))
}
use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub fn get_commit_hash() -> String {
    env!("COMMIT_HASH").to_string()
}

#[tauri::command]
pub fn is_avx2_enabled() -> bool {
    #[cfg(all(any(target_arch = "x86", target_arch = "x86_64"), not(target_os = "macos")))]
    {
        is_x86_feature_detected!("avx2")
    }
    #[cfg(not(all(any(target_arch = "x86", target_arch = "x86_64"), not(target_os = "macos"))))]
    {
        true
    }
}

#[tauri::command]
pub fn track_analytics_event(app_handle: tauri::AppHandle, name: String, props: Option<Value>) -> Result<()> {
    crate::analytics::track_event_handle_with_props(&app_handle, &name, props);
    Ok(())
}

#[tauri::command]
pub fn get_logs_folder(app_handle: tauri::AppHandle) -> Result<PathBuf> {
    Ok(app_handle.path().app_config_dir()?)
}

#[tauri::command]
pub async fn show_log_path(app_handle: tauri::AppHandle) -> Result<()> {
    let log_path = crate::logging::get_log_path(&app_handle)?;
    if log_path.exists() {
        showfile::show_path_in_file_manager(log_path);
    } else if let Some(parent) = log_path.parent() {
        showfile::show_path_in_file_manager(parent);
    }
    Ok(())
}

#[tauri::command]
pub async fn show_temp_path() -> Result<()> {
    let temp_path = ffmpeg::get_vibe_temp_folder();
    showfile::show_path_in_file_manager(temp_path);
    Ok(())
}

#[tauri::command]
pub fn get_models_folder(app_handle: tauri::AppHandle) -> Result<PathBuf> {
    let store = app_handle.store(STORE_FILENAME)?;

    let models_folder = store.get("models_folder").and_then(|p| p.as_str().map(PathBuf::from));
    if let Some(models_folder) = models_folder {
        tracing::debug!("models folder: {:?}", models_folder);
        return Ok(models_folder);
    }
    let path = app_handle.path().app_local_data_dir().context("Can't get data directory")?;
    Ok(path)
}

#[tauri::command]
pub fn get_logs(app_handle: tauri::AppHandle) -> Result<String> {
    let path = crate::logging::get_log_path(&app_handle)?;
    let content = std::fs::read_to_string(path)?;
    Ok(content)
}

#[tauri::command]
pub fn is_crashed_recently() -> bool {
    tracing::debug!("checking path {}", ffmpeg::get_vibe_temp_folder().join("crash.txt").display());
    ffmpeg::get_vibe_temp_folder().join("crash.txt").exists()
}

#[tauri::command]
pub fn rename_crash_file() -> Result<()> {
    std::fs::rename(
        ffmpeg::get_vibe_temp_folder().join("crash.txt"),
        ffmpeg::get_vibe_temp_folder().join("crash.1.txt"),
    )
    .context("Can't delete file")
}

#[tauri::command]
pub fn type_text(text: String) -> Result<()> {
    use enigo::{Enigo, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| eyre::eyre!("Failed to create enigo: {}", e))?;
    // Small delay to let the user's key release propagate
    std::thread::sleep(std::time::Duration::from_millis(100));
    enigo.text(&text).map_err(|e| eyre::eyre!("Failed to type text: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_cargo_features() -> Vec<String> {
    Vec::new()
}
