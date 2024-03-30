// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod errors;
use env_logger;
use log;
use std::sync::Mutex;
use tauri::Manager;
use vibe::transcript::Transcript;

static APP_INSTANCE: once_cell::sync::Lazy<Mutex<Option<tauri::AppHandle>>> = once_cell::sync::Lazy::new(|| Mutex::new(None));
static APP_ASYNC_INSTANCE: once_cell::sync::Lazy<tokio::sync::Mutex<Option<tauri::AppHandle>>> =
    once_cell::sync::Lazy::new(|| tokio::sync::Mutex::new(None));

fn on_transcribe_progress(progress: i32) {
    if let Some(app) = APP_INSTANCE.lock().unwrap().as_ref() {
        log::debug!("desktop progress is {}", progress);
        let window = app.get_webview_window("main").unwrap();
        window.emit("transcribe_progress", progress).unwrap();
    } else {
        log::error!("App instance not available");
    }
}

async fn on_download_progress(current: u64, total: u64) {
    if let Some(app) = APP_ASYNC_INSTANCE.lock().await.as_ref() {
        let window: tauri::WebviewWindow = app.get_webview_window("main").unwrap();
        window.emit("download_progress", (current, total)).unwrap();
    } else {
        log::error!("App instance not available");
    }
}

#[tauri::command]
async fn download_model(app: tauri::AppHandle) -> Result<(), String> {
    *APP_ASYNC_INSTANCE.lock().await = Some(app.clone());
    let model_path = vibe::config::get_model_path().map_err(|e| pretty_error!(e))?;
    let mut downloader = vibe::downloader::Downloader::new();
    log::debug!("Download model invoked! with path {}", model_path.display());
    downloader
        .download(config::URL, model_path.to_owned(), Some(config::HASH), on_download_progress)
        .await
        .map_err(|e| pretty_error!(e))?;
    Ok(())
}

#[tauri::command]
async fn get_default_model_path() -> Result<String, String> {
    let model_path = vibe::config::get_model_path().map_err(|e| pretty_error!(e))?;
    let model_path = model_path.to_str().ok_or("cant convert model path to string")?;
    Ok(model_path.to_string())
}

#[tauri::command]
async fn transcribe(app: tauri::AppHandle, options: vibe::config::ModelArgs) -> Result<Transcript, String> {
    // Store the app instance in the global static variable
    *APP_INSTANCE.lock().unwrap() = Some(app.clone());
    let transcript = vibe::model::transcribe(&options, Some(on_transcribe_progress)).map_err(|e| pretty_error!(e))?;
    Ok(transcript)
}

fn main() {
    env_logger::init();
    log::debug!("App started");
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_app::init())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![transcribe, download_model, get_default_model_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
