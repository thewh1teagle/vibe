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

#[tauri::command]
pub async fn cleanup_transcript(text: String, lang: String, api_key: String) -> Result<String> {
    crate::cleanup::cleanup_text(&text, &lang, &api_key).await
}

#[tauri::command]
pub async fn fix_text(text: String, mode: String, api_key: String) -> Result<String> {
    crate::cleanup::fix_text(&text, &mode, &api_key).await
}

#[tauri::command]
pub fn read_clipboard(app: tauri::AppHandle) -> Result<String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().read_text().context("Failed to read clipboard")
}

#[tauri::command]
pub async fn fix_selected_text(mode: String, api_key: String, app: tauri::AppHandle) -> Result<String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    use enigo::{Enigo, Key, Keyboard, Settings};

    let clipboard = app.clipboard();

    // Step 1: Save current clipboard content
    let original = clipboard
        .read_text()
        .unwrap_or_default();

    // Step 2: Write a unique marker so we can detect if Ctrl+C actually copied something
    let marker = format!("__vibe_marker_{}__", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());
    clipboard
        .write_text(&marker)
        .map_err(|e| eyre::eyre!("Failed to write marker to clipboard: {:?}", e))?;

    // Step 3: Let the marker propagate
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    // Step 4: Simulate Ctrl+C to copy any selected text
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| eyre::eyre!("Failed to create enigo: {}", e))?;
    enigo
        .key(Key::Control, enigo::Direction::Press)
        .map_err(|e| eyre::eyre!("Failed to press Control: {}", e))?;
    enigo
        .key(Key::Unicode('c'), enigo::Direction::Click)
        .map_err(|e| eyre::eyre!("Failed to click C: {}", e))?;
    enigo
        .key(Key::Control, enigo::Direction::Release)
        .map_err(|e| eyre::eyre!("Failed to release Control: {}", e))?;

    // Step 5: Let the copy complete
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;

    // Step 6: Read clipboard after Ctrl+C
    let after_copy = clipboard
        .read_text()
        .map_err(|e| eyre::eyre!("Failed to read clipboard after copy: {:?}", e))?;

    // Step 7: Decide what text to use
    let text_to_fix = if after_copy != marker && !after_copy.trim().is_empty() {
        // Clipboard changed from marker → Ctrl+C copied something
        after_copy
    } else {
        // No selection → try original clipboard content
        if !original.trim().is_empty() {
            original
        } else {
            // Restore clipboard and bail
            let _ = clipboard.write_text(&original);
            eyre::bail!("No text selected and clipboard is empty");
        }
    };

    // Step 8: Send to LLM
    let fixed = crate::cleanup::fix_text(&text_to_fix, &mode, &api_key).await?;

    // Step 9: Write result to clipboard
    clipboard
        .write_text(&fixed)
        .map_err(|e| eyre::eyre!("Failed to write result to clipboard: {:?}", e))?;

    Ok(fixed)
}
