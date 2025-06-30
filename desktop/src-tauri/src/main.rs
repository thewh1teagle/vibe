// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cleaner;
mod cmd;
mod config;

mod setup;
mod utils;
use tauri::{Emitter, Manager};
mod logging;

#[cfg(target_os = "macos")]
mod dock;

#[cfg(windows)]
mod custom_protocol;

#[cfg(target_os = "macos")]
mod screen_capture_kit;

use eyre::{eyre, Result};
use tauri_plugin_window_state::StateFlags;

use utils::LogError;

fn main() -> Result<()> {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            tracing::debug!("{}, {argv:?}, {cwd}", app.package_info().name);
            if let Some(webview) = app.get_webview_window("main") {
                webview.set_focus().map_err(|e| eyre!("{:?}", e)).log_error();
            }
            app.emit("single-instance", argv).map_err(|e| eyre!("{:?}", e)).log_error();
        }))
        .setup(|app| setup::setup(app))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(!StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_keepawake::init())
        .invoke_handler(tauri::generate_handler![
            cmd::download_file,
            cmd::transcribe,
            cmd::glob_files,
            cmd::download_model,
            cmd::load_model,
            cmd::get_commit_hash,
            cmd::is_online,
            cmd::get_path_dst,
            cmd::get_logs,
            cmd::open_path,
            cmd::get_x86_features,
            cmd::get_save_path,
            cmd::get_argv,
            cmd::audio::get_audio_devices,
            cmd::audio::start_record,
            cmd::get_models_folder,
            cmd::is_portable,
            cmd::get_logs_folder,
            cmd::show_log_path,
            cmd::show_temp_path,
            cmd::get_ffmpeg_path,
            cmd::ytdlp::download_audio,
            cmd::ytdlp::get_temp_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    Ok(())
}
