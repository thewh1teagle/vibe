// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
mod cmd;
mod config;
mod errors;

pub static APP_ASYNC_STATIC: once_cell::sync::Lazy<tokio::sync::Mutex<Option<tauri::AppHandle>>> =
    once_cell::sync::Lazy::new(|| tokio::sync::Mutex::new(None));
pub static APP_STATIC: once_cell::sync::Lazy<std::sync::Mutex<Option<tauri::AppHandle>>> =
    once_cell::sync::Lazy::new(|| std::sync::Mutex::new(None));

fn main() {
    env_logger::init();
    log::debug!("App started");
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.app_handle();
            tauri::async_runtime::block_on(async {
                *APP_ASYNC_STATIC.lock().await = Some(app_handle.to_owned());
            });
            *APP_STATIC.lock().unwrap() = Some(app_handle.to_owned());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd::transcribe,
            cmd::download_model,
            cmd::get_default_model_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
