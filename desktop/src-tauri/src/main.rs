// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cmd;
mod config;
mod deep_link;
mod panic_hook;
mod setup;

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
mod x86_features;

#[cfg(all(target_os = "windows", feature = "attach-console"))]
mod console;

use tauri_plugin_window_state::StateFlags;

fn main() {
    // Attach console IF:
    // OS is Windows + RUST_LOG was set + attach-console feature was set + console is available.
    #[cfg(all(windows, feature = "attach-console"))]
    console::attach();

    env_logger::init();
    log::debug!("Vibe App Running");

    tauri::Builder::default()
        .setup(|app| setup::setup(app))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(!StateFlags::VISIBLE)
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
            cmd::is_online,
            cmd::get_path_dst,
            cmd::open_path,
            cmd::get_x86_features,
            cmd::get_save_path,
            #[cfg(any(windows, target_os = "linux"))]
            cmd::get_deeplinks
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
