use crate::{config, pretty_error, APP_ASYNC_STATIC, APP_STATIC};
use log;
use tauri::Manager;
use vibe::transcript::Transcript;

fn on_transcribe_progress(progress: i32) {
    if let Some(app) = &*APP_STATIC.lock().unwrap() {
        log::debug!("desktop progress is {}", progress);
        let window = app.get_webview_window("main").unwrap();
        window.emit("transcribe_progress", progress).unwrap();
    } else {
        log::error!("App instance not available");
    }
}

async fn on_download_progress(current: u64, total: u64) {
    if let Some(app) = APP_ASYNC_STATIC.lock().await.as_ref() {
        let window: tauri::WebviewWindow = app.get_webview_window("main").unwrap();
        window.emit("download_progress", (current, total)).unwrap();
    } else {
        log::error!("App instance not available");
    }
}

#[tauri::command]
pub async fn download_model() -> Result<(), String> {
    let model_path = vibe::config::get_model_path().map_err(|e| pretty_error!(e))?;
    let mut downloader = vibe::downloader::Downloader::new();
    log::debug!("Download model invoked! with path {}", model_path.display());
    downloader
        .download(config::URL, model_path.to_owned(), on_download_progress)
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
pub async fn transcribe(options: vibe::config::ModelArgs) -> Result<Transcript, String> {
    let transcript = vibe::model::transcribe(&options, Some(on_transcribe_progress))
        .map_err(|e| pretty_error!(e))
        .map_err(|e| format!("{:?}\noptions: {:?}", e, options))?;
    Ok(transcript)
}
