use crate::config::STORE_FILENAME;
use crate::ffmpeg;
use eyre::Context;

/// Return true if there's internet connection
/// timeout in ms
#[tauri::command]
pub async fn is_online(timeout: Option<u64>) -> CommandResult<bool> {
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
use crate::error::CommandResult;
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
    // A real check on every x86 machine, Intel Macs included: a hardcoded `true` there once
    // sent a bug report down the wrong path (#1499).
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        is_x86_feature_detected!("avx2")
    }
    #[cfg(not(any(target_arch = "x86", target_arch = "x86_64")))]
    {
        true
    }
}

#[tauri::command]
pub fn track_analytics_event(app_handle: tauri::AppHandle, name: String, props: Option<Value>) -> CommandResult<()> {
    // The webview is not trusted with the event set: only its known events and props get through.
    crate::analytics::track_webview_event(&app_handle, &name, props);
    Ok(())
}

#[tauri::command]
pub fn get_logs_folder(app_handle: tauri::AppHandle) -> CommandResult<PathBuf> {
    Ok(app_handle.path().app_config_dir()?)
}

#[tauri::command]
pub async fn show_log_path(app_handle: tauri::AppHandle) -> CommandResult<()> {
    let log_path = crate::logging::get_log_path(&app_handle)?;
    if log_path.exists() {
        showfile::show_path_in_file_manager(log_path);
    } else if let Some(parent) = log_path.parent() {
        showfile::show_path_in_file_manager(parent);
    }
    Ok(())
}

#[tauri::command]
pub async fn show_temp_path() -> CommandResult<()> {
    let temp_path = ffmpeg::get_vibe_temp_folder();
    showfile::show_path_in_file_manager(temp_path);
    Ok(())
}

#[tauri::command]
pub fn get_models_folder(app_handle: tauri::AppHandle) -> CommandResult<PathBuf> {
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
pub fn get_logs(app_handle: tauri::AppHandle) -> CommandResult<String> {
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
pub fn rename_crash_file() -> CommandResult<()> {
    Ok(std::fs::rename(
        ffmpeg::get_vibe_temp_folder().join("crash.txt"),
        ffmpeg::get_vibe_temp_folder().join("crash.1.txt"),
    )
    .context("Can't delete file")?)
}

/// Longest text `type_text` will type: about an hour of continuous speech.
const MAX_TYPED_CHARS: usize = 50_000;

/// How long after a recording ends its text may still be typed. Covers transcribing a long
/// dictation on a slow CPU plus an optional LLM clean-up, with room to spare.
const TYPE_TEXT_WINDOW: std::time::Duration = std::time::Duration::from_secs(30 * 60);

/// When the last recording finished, set by the audio recorder. Each finished recording lets
/// `type_text` run once; typing consumes it.
static RECORDING_FINISHED_AT: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);

/// Called by the recorder when a recording has been written, just before `record_finish`.
pub fn recording_finished() {
    if let Ok(mut finished) = RECORDING_FINISHED_AT.lock() {
        *finished = Some(std::time::Instant::now());
    }
}

/// Whether a recording finished within `window` of `now`. Consumes it either way, so one
/// recording authorizes one typing, and a stale one does not linger.
fn take_recording_permit(now: std::time::Instant, window: std::time::Duration) -> bool {
    let Ok(mut finished) = RECORDING_FINISHED_AT.lock() else {
        return false;
    };
    finished.take().is_some_and(|at| now.saturating_duration_since(at) <= window)
}

/// The text with control characters removed, except newline and tab (dictation with
/// "normalize output" off keeps its line breaks); `\r\n` becomes `\n`. `None` when it is too long.
fn sanitize_typed_text(text: &str) -> Option<String> {
    let cleaned: String = text.chars().filter(|&c| c == '\n' || c == '\t' || !c.is_control()).collect();
    (cleaned.chars().count() <= MAX_TYPED_CHARS).then_some(cleaned)
}

/// Types the dictated text into the focused application. Only right after a recording made by the
/// Rust recorder finished (see `recording_finished`), once per recording, so a webview that merely
/// calls this command cannot type into other apps at will.
#[tauri::command]
pub fn type_text(text: String) -> CommandResult<()> {
    use enigo::{Enigo, Keyboard, Settings};
    let Some(text) = sanitize_typed_text(&text) else {
        return Err(eyre::eyre!("Text is too long to type ({} characters at most)", MAX_TYPED_CHARS).into());
    };
    if !take_recording_permit(std::time::Instant::now(), TYPE_TEXT_WINDOW) {
        return Err(eyre::eyre!("Refusing to type: no dictation recording finished recently").into());
    }
    if text.is_empty() {
        return Ok(());
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn typed_text_keeps_newlines_and_tabs_and_drops_other_controls() {
        assert_eq!(sanitize_typed_text("hello world").unwrap(), "hello world");
        assert_eq!(
            sanitize_typed_text("line one\nline two\tend").unwrap(),
            "line one\nline two\tend"
        );
        assert_eq!(sanitize_typed_text("a\r\nb").unwrap(), "a\nb");
        assert_eq!(sanitize_typed_text("a\u{1b}[2Jb\u{0}c\u{7f}d\u{8}").unwrap(), "a[2Jbcd");
        assert_eq!(sanitize_typed_text("שלום 🎉 naïve").unwrap(), "שלום 🎉 naïve");
        assert_eq!(sanitize_typed_text("\u{85}x\u{9b}").unwrap(), "x");
    }

    #[test]
    fn typed_text_is_capped() {
        assert!(sanitize_typed_text(&"ש".repeat(MAX_TYPED_CHARS)).is_some());
        assert!(sanitize_typed_text(&"a".repeat(MAX_TYPED_CHARS + 1)).is_none());
        // Stripped controls do not count against the cap.
        assert!(sanitize_typed_text(&format!("{}{}", "a".repeat(MAX_TYPED_CHARS), "\u{0}".repeat(10))).is_some());
    }

    #[test]
    fn a_recording_permits_one_typing_within_the_window() {
        let window = Duration::from_secs(60);
        *RECORDING_FINISHED_AT.lock().unwrap() = None;
        assert!(!take_recording_permit(Instant::now(), window), "no recording, no typing");
        recording_finished();
        assert!(take_recording_permit(Instant::now(), window));
        assert!(!take_recording_permit(Instant::now(), window), "one recording, one typing");
        recording_finished();
        assert!(
            !take_recording_permit(Instant::now() + window + Duration::from_secs(1), window),
            "stale"
        );
        assert!(!take_recording_permit(Instant::now(), window), "a stale permit is consumed");
    }
}
