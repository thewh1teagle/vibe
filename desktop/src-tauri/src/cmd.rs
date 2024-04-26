use crate::config;
use eyre::{Context, ContextCompat, OptionExt, Result};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{
    window::{ProgressBarState, ProgressBarStatus},
    Manager,
};
use vibe::{model::SegmentCallbackData, transcript::Transcript};

#[tauri::command]
pub fn get_commit_hash() -> String {
    env!("COMMIT_HASH").to_string()
}

#[tauri::command]
pub async fn download_model(app_handle: tauri::AppHandle) -> Result<()> {
    let model_path = vibe::config::get_model_path()?;
    let mut downloader = vibe::downloader::Downloader::new();
    log::debug!("Download model invoked! with path {}", model_path.display());

    let app_handle_c = app_handle.clone();
    let download_progress_callback = move |current: u64, total: u64| {
        let window: tauri::WebviewWindow = app_handle_c.get_webview_window("main").unwrap();
        let percentage = current / total * 100;
        window
            .set_progress_bar(ProgressBarState {
                progress: Some(percentage),
                status: Some(ProgressBarStatus::Indeterminate),
            })
            .unwrap();
        window.emit("download_progress", (current, total)).unwrap();
        async {}
    };
    downloader
        .download(config::URL, model_path.to_owned(), download_progress_callback)
        .await?;
    let window = app_handle.get_webview_window("main").unwrap();
    window
        .set_progress_bar(ProgressBarState {
            progress: None,
            status: Some(ProgressBarStatus::None),
        })
        .unwrap();
    Ok(())
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
        let window = app_handle_c.get_webview_window("main").context("get window").unwrap();
        window
            .set_progress_bar(ProgressBarState {
                progress: None,
                status: Some(ProgressBarStatus::None),
            })
            .unwrap();
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let abort_callback = move || abort_atomic.load(Ordering::Relaxed);

    let app_handle_c = app_handle.clone();
    let progress_callback = move |progress: i32| {
        // log::debug!("desktop progress is {}", progress);
        let window = app_handle_c.get_webview_window("main").unwrap();
        window
            .set_progress_bar(ProgressBarState {
                progress: Some(progress.try_into().unwrap()),
                status: Some(ProgressBarStatus::Indeterminate),
            })
            .unwrap();
        window.emit("transcribe_progress", progress).unwrap();
    };

    let transcript = vibe::model::transcribe(
        &options,
        Some(Box::new(progress_callback)),
        Some(Box::new(new_segment_callback)),
        Some(Box::new(abort_callback)),
    )
    .with_context(|| format!("options: {:?}", options))?;
    let window = app_handle.get_webview_window("main").context("get window")?;
    window.set_progress_bar(ProgressBarState {
        progress: None,
        status: Some(ProgressBarStatus::None),
    })?;
    Ok(transcript)
}
