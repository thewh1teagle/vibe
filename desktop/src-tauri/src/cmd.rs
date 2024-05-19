use crate::config;
use eyre::{Context, ContextCompat, OptionExt, Result};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tauri::{
    window::{ProgressBarState, ProgressBarStatus},
    Manager,
};
use vibe::{model::SegmentCallbackData, transcript::Transcript};

/// Return true if there's internet connection
/// timeout in ms
#[tauri::command]
pub fn is_online(timeout: Option<u64>) -> bool {
    let timeout = timeout.unwrap_or(2000); // Default 2 seconds timeout
    let addr = "8.8.8.8:53"; // Google DNS
    let timeout_duration = Duration::from_millis(timeout);

    match addr.parse::<SocketAddr>() {
        Ok(socket_addr) => TcpStream::connect_timeout(&socket_addr, timeout_duration).is_ok(),
        Err(err) => {
            log::error!("{:?}", err);
            false
        }
    }
}

fn set_progress_bar(app_handle: &tauri::AppHandle, progress: Option<f64>) -> Result<()> {
    let window = app_handle.get_webview_window("main").context("get window")?;
    if let Some(progress) = progress {
        log::debug!("set_progress_bar {}", progress);
        window.emit("transcribe_progress", progress).unwrap();
        if progress > 1.0 {
            window.set_progress_bar(ProgressBarState {
                progress: Some(progress as u64),
                status: if cfg!(target_os = "windows") {
                    // It works in Windows without it, and setting it causes it to jump every time.
                    None
                } else {
                    Some(ProgressBarStatus::Indeterminate)
                },
            })?;
        }
    } else {
        window.set_progress_bar(ProgressBarState {
            progress: Some(0),
            status: Some(ProgressBarStatus::None),
        })?;
    }
    Ok(())
}

#[tauri::command]
#[cfg(any(windows, target_os = "linux"))]
pub fn get_deeplinks(app_handle: tauri::AppHandle) -> Vec<String> {
    let opened_urls = app_handle.state::<crate::setup::OpenedUrls>();
    let opened_urls = opened_urls.0.lock().unwrap();
    let mut urls = Vec::new();

    if let Some(opened_urls) = &*opened_urls {
        for url in opened_urls {
            urls.push(url.to_string());
        }
    }

    urls
}

#[tauri::command]
pub fn get_commit_hash() -> String {
    env!("COMMIT_HASH").to_string()
}

#[tauri::command]
pub async fn download_model(app_handle: tauri::AppHandle) -> Result<String> {
    let model_path = vibe::config::get_model_path()?;
    let mut downloader = vibe::downloader::Downloader::new();
    log::debug!("Download model invoked! with path {}", model_path.display());

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    let app_handle_c = app_handle.clone();

    // allow abort transcription
    let app_handle_d = app_handle_c.clone();
    app_handle.listen("abort_download", move |_| {
        set_progress_bar(&app_handle_d, None).unwrap();
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let download_progress_callback = {
        let app_handle = app_handle.clone();
        let abort_atomic = abort_atomic.clone();

        move |current: u64, total: u64| {
            let app_handle = app_handle.clone();

            // Update progress in background
            tauri::async_runtime::spawn(async move {
                let window = app_handle.get_webview_window("main").unwrap();
                let percentage = (current as f64 / total as f64) * 100.0;
                log::debug!("percentage: {}", percentage);
                if let Err(e) = set_progress_bar(&app_handle, Some(percentage)) {
                    log::error!("Failed to set progress bar: {}", e);
                }
                if let Err(e) = window.emit("download_progress", (current, total)) {
                    log::error!("Failed to emit download progress: {}", e);
                }
            });
            // Return the abort signal immediately
            abort_atomic.load(Ordering::Relaxed)
        }
    };

    downloader
        .download(config::URL, model_path.to_owned(), download_progress_callback)
        .await?;
    set_progress_bar(&app_handle_c, None).unwrap();
    Ok(model_path.to_str().context("to_str")?.to_string())
}

#[tauri::command]
pub async fn get_default_model_path() -> Result<String> {
    let model_path = vibe::config::get_model_path()?;
    let model_path = model_path.to_str().ok_or_eyre("cant convert model path to string")?;
    Ok(model_path.to_string())
}

#[tauri::command]
pub async fn transcribe(app_handle: tauri::AppHandle, options: vibe::config::ModelArgs) -> Result<Transcript> {
    let app_handle_c = app_handle.clone();

    let new_segment_callback = move |data: SegmentCallbackData| {
        app_handle_c
            .clone()
            .emit_to(
                "main",
                "new_segment",
                serde_json::json!({"start": data.start_timestamp, "end": data.end_timestamp, "text": data.text}),
            )
            .unwrap();
    };
    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    // allow abort transcription
    let app_handle_c = app_handle.clone();
    app_handle.listen("abort_transcribe", move |_| {
        set_progress_bar(&app_handle_c, None).unwrap();
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let abort_callback = move || abort_atomic.load(Ordering::Relaxed);

    let app_handle_c = app_handle.clone();
    let progress_callback = move |progress: i32| {
        // log::debug!("desktop progress is {}", progress);
        set_progress_bar(&app_handle, Some(progress.into())).unwrap();
    };

    let transcript = vibe::model::transcribe(
        &options,
        Some(Box::new(progress_callback)),
        Some(Box::new(new_segment_callback)),
        Some(Box::new(abort_callback)),
    )
    .with_context(|| format!("options: {:?}", options))?;
    set_progress_bar(&app_handle_c, None).unwrap();
    Ok(transcript)
}

#[tauri::command]
pub fn get_path_dst(src: String, suffix: String) -> Result<String> {
    let src = PathBuf::from(src);
    let src_filename = src.file_name().context("filename")?.to_str().context("stostr")?;
    let src_name = src
        .file_stem()
        .map(|name| name.to_str().context("tosstr"))
        .unwrap_or(Ok(src_filename))?;

    let parent = src.parent().context("parent")?;
    let mut dst_path = parent.join(format!("{}{}", src_name, suffix));

    // Ensure we don't overwrite existing file
    let mut counter = 0;
    while dst_path.exists() {
        dst_path = parent.join(format!("{} ({}){}", src_name, counter, suffix));
        counter += 1;
    }
    Ok(dst_path.to_str().context("tostr")?.into())
}
