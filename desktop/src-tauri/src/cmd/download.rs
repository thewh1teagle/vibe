use crate::error::LogError;
use eyre::{Context, Result};
use futures_util::StreamExt;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Emitter, Listener, Manager};

use super::ui::set_progress_bar;

#[tauri::command]
pub async fn download_model(app_handle: tauri::AppHandle, url: String, path: String) -> Result<String> {
    tracing::debug!("Download model invoked! with path {}", path);

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    let app_handle_c = app_handle.clone();

    let app_handle_d = app_handle_c.clone();
    app_handle.listen("abort_download", move |_| {
        set_progress_bar(&app_handle_d, None).log_error();
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let client = reqwest::Client::new();
    let res = client.get(&url).send().await?.error_for_status()?;
    let total_size = res.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(&path).context(format!("Failed to create file {}", path))?;
    let mut downloaded: u64 = 0;
    let callback_limit: u64 = 1024 * 1024 * 2;
    let mut callback_offset: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        if abort_atomic.load(Ordering::Relaxed) {
            break;
        }
        let chunk = item.context("Error while downloading file")?;
        use std::io::Write;
        file.write_all(&chunk)
            .context(format!("Error while writing to file {}", path))?;
        downloaded += chunk.len() as u64;
        if total_size > 0 && downloaded > callback_offset + callback_limit {
            let percentage = (downloaded as f64 / total_size as f64) * 100.0;
            tracing::trace!("percentage: {}", percentage);
            set_progress_bar(&app_handle_c, Some(percentage)).log_error();
            if let Some(window) = app_handle_c.get_webview_window("main") {
                window.emit("download_progress", (downloaded, total_size)).log_error();
            }
            callback_offset = downloaded;
        }
    }
    set_progress_bar(&app_handle, None)?;
    Ok(path)
}

#[tauri::command]
pub async fn download_file(app_handle: tauri::AppHandle, url: String, path: String) -> Result<()> {
    tracing::debug!("Download file invoked! with path {}", path);

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    let app_handle_c = app_handle.clone();

    let app_handle_d = app_handle_c.clone();
    app_handle.listen("abort_download", move |_| {
        set_progress_bar(&app_handle_d, None).log_error();
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let client = reqwest::Client::new();
    let res = client.get(&url).send().await?.error_for_status()?;
    let total_size = res.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(&path).context(format!("Failed to create file {}", path))?;
    let mut downloaded: u64 = 0;
    let callback_limit: u64 = 1024 * 1024 * 2;
    let mut callback_offset: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        if abort_atomic.load(Ordering::Relaxed) {
            break;
        }
        let chunk = item.context("Error while downloading file")?;
        use std::io::Write;
        file.write_all(&chunk)
            .context(format!("Error while writing to file {}", path))?;
        downloaded += chunk.len() as u64;
        if total_size > 0 && downloaded > callback_offset + callback_limit {
            let percentage = (downloaded as f64 / total_size as f64) * 100.0;
            tracing::trace!("percentage: {}", percentage);
            if let Some(window) = app_handle_c.get_webview_window("main") {
                window.emit("download_progress", (downloaded, total_size)).log_error();
            }
            callback_offset = downloaded;
        }
    }
    Ok(())
}
