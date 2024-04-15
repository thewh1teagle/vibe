// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cmd;
mod config;
mod errors;

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
        .invoke_handler(tauri::generate_handler![
            cmd::transcribe,
            cmd::download_model,
            cmd::get_default_model_path,
            cmd::get_commit_hash
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
