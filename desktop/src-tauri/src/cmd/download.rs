use crate::error::LogError;
use eyre::{Context, Result};
use futures_util::StreamExt;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Emitter, Listener, Manager};

async fn download_stream(app_handle: &tauri::AppHandle, url: &str, path: &str, abort_atomic: &Arc<AtomicBool>) -> Result<()> {
    let client = reqwest::Client::new();
    let res = client.get(url).send().await?.error_for_status()?;
    let total_size = res.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(path).context(format!("Failed to create file {}", path))?;
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

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();
    let listener_id = app_handle.listen("abort_download", move |_| {
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let result = download_stream(&app_handle, &url, &path, &abort_atomic).await;
    app_handle.unlisten(listener_id);
    result?;
    Ok(path)
}
