// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use env_logger;
use log::debug;
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;
use vibe::transcript::Transcript;

static APP_INSTANCE: once_cell::sync::Lazy<Mutex<Option<tauri::AppHandle>>> = once_cell::sync::Lazy::new(|| Mutex::new(None));

fn on_progress_change(progress: i32) {
    if let Some(app) = APP_INSTANCE.lock().unwrap().as_ref() {
        debug!("desktop progress is {}", progress);
        let window: tauri::Window = app.get_window("main").unwrap();
        window.emit("progress", progress).unwrap();
    } else {
        println!("App instance not available");
    }
}

#[tauri::command]
async fn transcribe(app: tauri::AppHandle, path: &str, lang: &str) -> Result<Transcript, String> {
    // Store the app instance in the global static variable
    *APP_INSTANCE.lock().unwrap() = Some(app);
    let model = vibe::config::get_model_path().map_err(|e| e.to_string())?;
    let options = vibe::config::ModelArgs {
        lang: Some(lang.to_owned()),
        model,
        path: PathBuf::from(path),
        n_threads: None,
        verbose: false,
    };
    let transcript = vibe::model::transcribe(&options, Some(on_progress_change)).map_err(|e| e.to_string())?;
    return Ok(transcript);
}

fn main() {
    env_logger::init();
    debug!("App started");
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![transcribe])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
