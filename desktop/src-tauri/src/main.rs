// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod analytics;
mod audio_utils;
mod cleaner;
mod cli;
mod cmd;
mod config;
mod setup;
mod sona;
mod types;
mod utils;
use tauri::{Emitter, Manager};
mod logging;

#[cfg(target_os = "macos")]
mod dock;

#[cfg(all(any(target_arch = "x86", target_arch = "x86_64"), target_os = "windows"))]
mod x86_features;

#[cfg(windows)]
mod custom_protocol;

#[cfg(target_os = "macos")]
mod screen_capture_kit;

use eyre::{eyre, Result};
use tauri_plugin_window_state::StateFlags;

use utils::LogError;

#[tokio::main]
async fn main() -> Result<()> {
    // Attach console in Windows:
    #[cfg(all(windows, not(debug_assertions)))]
    cli::attach_console();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            tracing::debug!("{}, {argv:?}, {cwd}", app.package_info().name);
            if let Some(webview) = app.get_webview_window("main") {
                webview.set_focus().map_err(|e| eyre!("{:?}", e)).log_error();
            }
            app.emit("single-instance", argv).map_err(|e| eyre!("{:?}", e)).log_error();
        }))
        .setup(|app| {
            setup::setup(app)?;
            analytics::track_event(app, analytics::events::APP_STARTED);
            Ok(())
        })
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init());

    if analytics::is_aptabase_configured() {
        let options = tauri_plugin_aptabase::InitOptions {
            host: Some(analytics::APTABASE_BASE_URL.to_string()),
            ..Default::default()
        };
        builder = builder.plugin(
            tauri_plugin_aptabase::Builder::new(analytics::APTABASE_APP_KEY)
                .with_options(options)
                .build(),
        );
    }

    #[cfg(feature = "keepawake")]
    {
        builder = builder.plugin(tauri_plugin_keepawake::init());
    }

    let app = builder
        .invoke_handler(tauri::generate_handler![
            cmd::download_file,
            cmd::get_cargo_features,
            cmd::transcribe,
            cmd::glob_files,
            cmd::download_model,
            cmd::load_model,
            cmd::get_api_base_url,
            cmd::start_api_server,
            cmd::stop_api_server,
            cmd::track_analytics_event,
            cmd::get_commit_hash,
            cmd::get_cuda_version,
            cmd::get_rocm_version,
            cmd::is_avx2_enabled,
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
            cmd::ytdlp::get_latest_ytdlp_version,
            cmd::is_crashed_recently,
            cmd::rename_crash_file,
            cmd::type_text
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            // Kill sona process on app exit
            let state: tauri::State<'_, tokio::sync::Mutex<setup::SonaState>> = app.state();
            let mut guard = match state.try_lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            if let Some(ref mut process) = guard.process {
                process.kill();
            }
        }
    });
    Ok(())
}
