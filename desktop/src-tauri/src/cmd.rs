use crate::{config, pretty_error};
use log;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::Manager;
use vibe::{model::SegmentCallbackData, transcript::Transcript};

#[tauri::command]
pub async fn download_model(app_handle: tauri::AppHandle) -> Result<(), String> {
    let model_path = vibe::config::get_model_path().map_err(|e| pretty_error!(e))?;
    let mut downloader = vibe::downloader::Downloader::new();
    log::debug!("Download model invoked! with path {}", model_path.display());

    let download_progress_callback = move |current: u64, total: u64| {
        let window: tauri::WebviewWindow = app_handle.get_webview_window("main").unwrap();
        window.emit("download_progress", (current, total)).unwrap();
        async {}
    };
    downloader
        .download(config::URL, model_path.to_owned(), download_progress_callback)
        .await
        .map_err(|e| pretty_error!(e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_default_model_path() -> Result<String, String> {
    let model_path = vibe::config::get_model_path().map_err(|e| pretty_error!(e))?;
    let model_path = model_path.to_str().ok_or("cant convert model path to string")?;
    Ok(model_path.to_string())
}

#[tauri::command]
pub async fn transcribe(app_handle: tauri::AppHandle, options: vibe::config::ModelArgs) -> Result<Transcript, String> {
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
    app_handle.listen("abort_transcribe", move |_| {
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let abort_callback = move || abort_atomic.load(Ordering::Relaxed);

    let progress_callback = move |progress: i32| {
        // log::debug!("desktop progress is {}", progress);
        let window = app_handle.get_webview_window("main").unwrap();
        window.emit("transcribe_progress", progress).unwrap();
    };

    let transcript = vibe::model::transcribe(
        &options,
        Some(Box::new(progress_callback)),
        Some(Box::new(new_segment_callback)),
        Some(Box::new(abort_callback)),
    )
    .map_err(|e| pretty_error!(e))
    .map_err(|e| format!("{:?}\noptions: {:?}", e, options))?;
    Ok(transcript)
}
