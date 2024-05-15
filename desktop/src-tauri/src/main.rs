// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cmd;
mod config;
mod crash_log;
mod setup;

use tauri_plugin_window_state::StateFlags;

fn main() {
    env_logger::init();
    log::debug!("App started");
    tauri::Builder::default()
        .setup(|app| setup::setup(app))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Controlled through JS API
                .with_state_flags(!StateFlags::all())
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
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
            cmd::get_commit_hash,
            #[cfg(any(windows, target_os = "linux"))]
            cmd::get_deeplinks
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
