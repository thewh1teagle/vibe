use crate::config;
use eyre::{bail, Context, ContextCompat, OptionExt, Result};
use serde_json::{json, Value};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{
    window::{ProgressBarState, ProgressBarStatus},
    Manager,
};
use vibe::{model::SegmentCallbackData, transcript::Transcript};
pub mod audio;

#[cfg(target_os = "macos")]
mod screen_capture_kit;

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
pub fn get_commit_hash() -> String {
    env!("COMMIT_HASH").to_string()
}

#[tauri::command]
pub fn get_x86_features() -> Option<Value> {
    #[cfg(all(any(target_arch = "x86", target_arch = "x86_64"), target_os = "windows"))]
    {
        let features: Value = serde_json::to_value(crate::x86_features::X86features::new()).unwrap_or_default();
        Some(features)
    }

    #[cfg(not(all(any(target_arch = "x86", target_arch = "x86_64"), target_os = "windows")))]
    {
        None
    }
}
#[tauri::command]
pub async fn download_model(app_handle: tauri::AppHandle, url: Option<String>) -> Result<String> {
    let model_path = if let Some(url) = url.clone() {
        let filename = vibe::downloader::get_filename(&url).await?;
        log::debug!("url filename is {}", filename);
        vibe::config::get_models_folder().unwrap().join(filename)
    } else {
        vibe::config::get_model_path()?
    };

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

    let download_url = if let Some(url) = url { url } else { config::URL.into() };
    downloader
        .download(&download_url, model_path.to_owned(), download_progress_callback)
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
pub async fn transcribe(app_handle: tauri::AppHandle, options: vibe::config::TranscribeOptions) -> Result<Transcript> {
    let app_handle_c = app_handle.clone();

    let new_segment_callback = move |data: SegmentCallbackData| {
        app_handle_c
            .clone()
            .emit_to(
                "main",
                "new_segment",
                serde_json::json!({"start": data.start_timestamp, "stop": data.end_timestamp, "text": data.text}),
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

    // prevent panic crash. sometimes whisper.cpp crash without nice errors.
    let unwind_result = catch_unwind(AssertUnwindSafe(|| {
        vibe::model::transcribe(
            &options,
            Some(Box::new(progress_callback)),
            Some(Box::new(new_segment_callback)),
            Some(Box::new(abort_callback)),
        )
    }));
    set_progress_bar(&app_handle_c, None).unwrap();
    match unwind_result {
        Err(error) => {
            bail!("transcribe crash: {:?}", error)
        }
        Ok(transcribe_result) => {
            let transcript = transcribe_result.with_context(|| format!("options: {:?}", options))?;
            Ok(transcript)
        }
    }
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

#[tauri::command]
pub fn get_save_path(src_path: PathBuf, target_ext: &str) -> Result<Value> {
    // Get the file stem (filename without extension)
    let stem = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();

    // Create a new path with the same directory and the new extension
    let mut new_path = src_path.clone();
    new_path.set_file_name(stem);
    new_path.set_extension(target_ext);
    let new_filename = new_path.file_name().map(|s| s.to_str()).unwrap_or(Some("Untitled"));
    // Convert the new path to a string
    let new_path = new_path.to_str().context("to_str")?;
    let named_path = json!({"name": new_filename, "path": new_path});
    Ok(named_path)
}

#[tauri::command]
/// Opens folder or open folder of a file
pub async fn open_path(path: PathBuf) -> Result<()> {
    if path.is_file() {
        showfile::show_path_in_file_manager(path);
    } else {
        open::that(path)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_cuda_version() -> String {
    env!("CUDA_VERSION").to_string()
}

#[tauri::command]
pub fn is_avx2_enabled() -> bool {
    #[allow(clippy::comparison_to_empty)]
    return env!("WHISPER_NO_AVX") != "ON";
}
