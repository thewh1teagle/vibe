use crate::config::STORE_FILENAME;
use crate::ffmpeg;
use eyre::{Context, Result};
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

const CRASH_FILENAME: &str = "crash.txt";
const CRASH_FILENAME_OLD: &str = "crash.1.txt";
const ONLINE_CHECK_TARGETS: [&str; 4] = ["1.1.1.1:80", "1.1.1.1:53", "8.8.8.8:53", "8.8.8.8:80"];
const TYPE_TEXT_FOCUS_DELAY_MS: u64 = 100;

#[tauri::command]
pub async fn is_online(timeout: Option<u64>) -> Result<bool> {
    let timeout = std::time::Duration::from_millis(timeout.unwrap_or(2000));

    let tasks = ONLINE_CHECK_TARGETS.iter().map(|addr| async move {
        tokio::time::timeout(timeout, tokio::net::TcpStream::connect(addr))
            .await
            .map(|res| res.is_ok())
            .unwrap_or(false)
    });

    Ok(futures::future::join_all(tasks).await.into_iter().any(|res| res))
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
pub fn is_crashed_recently() -> bool {
    tracing::debug!(
        "checking path {}",
        ffmpeg::get_vibe_temp_folder().join(CRASH_FILENAME).display()
    );
    ffmpeg::get_vibe_temp_folder().join(CRASH_FILENAME).exists()
}

#[tauri::command]
pub fn rename_crash_file() -> Result<()> {
    std::fs::rename(
        ffmpeg::get_vibe_temp_folder().join(CRASH_FILENAME),
        ffmpeg::get_vibe_temp_folder().join(CRASH_FILENAME_OLD),
    )
    .context("Failed to rename crash file")
}

#[tauri::command]
pub async fn type_text(text: String) -> Result<()> {
    use enigo::{Enigo, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| eyre::eyre!("Failed to create enigo: {}", e))?;
    tokio::time::sleep(std::time::Duration::from_millis(TYPE_TEXT_FOCUS_DELAY_MS)).await;
    let text = text.replace('\n', " ");
    enigo.text(&text).map_err(|e| eyre::eyre!("Failed to type text: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn test_groq_key(api_key: String) -> Result<bool> {
    crate::groq::test_api_key(&api_key).await
}
