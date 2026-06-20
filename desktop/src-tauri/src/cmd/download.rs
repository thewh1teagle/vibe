use crate::error::LogError;
use eyre::{Context, Result};
use futures_util::StreamExt;
use tauri::{Emitter, Manager};

use super::AbortGuard;

const DOWNLOAD_PROGRESS_THRESHOLD: u64 = 1024 * 1024 * 2;

async fn download_stream(app_handle: &tauri::AppHandle, url: &str, path: &str, abort: &AbortGuard) -> Result<()> {
    let client = reqwest::Client::new();
    let res = client.get(url).send().await?.error_for_status()?;
    let total_size = res.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(path).context(format!("Failed to create file {}", path))?;
    let mut downloaded: u64 = 0;
    let mut callback_offset: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        if abort.is_aborted() {
            break;
        }
        let chunk = item.context("Error while downloading file")?;
        use std::io::Write;
        file.write_all(&chunk)
            .context(format!("Error while writing to file {}", path))?;
        downloaded += chunk.len() as u64;
        if total_size > 0 && downloaded > callback_offset + DOWNLOAD_PROGRESS_THRESHOLD {
            if let Some(window) = app_handle.get_webview_window("main") {
                window.emit("download_progress", (downloaded, total_size)).log_error();
            }
            callback_offset = downloaded;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn download_model(app_handle: tauri::AppHandle, url: String, path: String) -> Result<String> {
    tracing::debug!("Download model invoked! with path {}", path);

    let abort = AbortGuard::new(&app_handle, "abort_download");
    download_stream(&app_handle, &url, &path, &abort).await?;
    Ok(path)
}
