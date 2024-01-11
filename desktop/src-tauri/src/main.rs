// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
use env_logger;
use log::debug;
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;
use vibe::transcript::Transcript;

static APP_INSTANCE: once_cell::sync::Lazy<Mutex<Option<tauri::AppHandle>>> = once_cell::sync::Lazy::new(|| Mutex::new(None));
static APP_ASYNC_INSTANCE: once_cell::sync::Lazy<tokio::sync::Mutex<Option<tauri::AppHandle>>> =
    once_cell::sync::Lazy::new(|| tokio::sync::Mutex::new(None));

fn on_transcribe_progress(progress: i32) {
    if let Some(app) = APP_INSTANCE.lock().unwrap().as_ref() {
        debug!("desktop progress is {}", progress);
        let window: tauri::Window = app.get_window("main").unwrap();
        window.emit("transcribe_progress", progress).unwrap();
    } else {
        println!("App instance not available");
    }
}

async fn on_download_progress(current: u64, total: u64) {
    if let Some(app) = APP_ASYNC_INSTANCE.lock().await.as_ref() {
        let window: tauri::Window = app.get_window("main").unwrap();
        window.emit("download_progress", (current, total)).unwrap();
    } else {
        println!("App instance not available");
    }
}

#[tauri::command]
fn get_model_path(app: tauri::AppHandle) -> String {
    let app_data = app.path_resolver().app_local_data_dir().unwrap();
    let model_path = app_data.join(config::FILENAME);
    return model_path.to_str().unwrap().to_string();
}

#[tauri::command]
async fn download_model(app: tauri::AppHandle) -> Result<(), String> {
    *APP_ASYNC_INSTANCE.lock().await = Some(app.clone());
    let app_data = app.path_resolver().app_local_data_dir().unwrap();
    let model_path = app_data.join(config::FILENAME);
    let mut downloader = vibe::downloader::Downloader::new();
    debug!("Download model invoked! with path {}", model_path.display());
    downloader
        .download(config::URL, model_path.to_owned(), Some(config::HASH), on_download_progress)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn transcribe(app: tauri::AppHandle, path: &str, lang: &str) -> Result<Transcript, String> {
    // Store the app instance in the global static variable
    *APP_INSTANCE.lock().unwrap() = Some(app.clone());
    let app_data = app.path_resolver().app_local_data_dir().unwrap();
    let model_path = app_data.join(config::FILENAME);
    let options = vibe::config::ModelArgs {
        lang: Some(lang.to_owned()),
        model: model_path,
        path: PathBuf::from(path),
        n_threads: None,
        verbose: false,
    };
    let transcript = vibe::model::transcribe(&options, Some(on_transcribe_progress)).map_err(|e| e.to_string())?;
    return Ok(transcript);
}

fn main() {
    env_logger::init();
    debug!("App started");
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![transcribe, get_model_path, download_model])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
