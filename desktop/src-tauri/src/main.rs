// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod analytics;
mod cleaner;
mod cli;
mod cmd;
mod config;
mod config_watcher;
mod diagnostics;
mod dictation_indicator;
mod error;
mod ffmpeg;
mod handoff;
mod keepawake;
mod logging;
mod setup;
mod sona;
mod transcript;
mod tray;
use tauri::Emitter;

#[cfg(target_os = "macos")]
mod dock;

#[cfg(windows)]
mod custom_protocol;

use eyre::{eyre, Result};
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

use error::LogError;

#[tokio::main]
async fn main() -> Result<()> {
    // Attach console in Windows:
    #[cfg(all(windows, not(debug_assertions)))]
    cli::attach_console();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .manage(tray::TrayState::default())
        .manage(keepawake::KeepAwake::new())
        .manage(tokio::sync::Mutex::<Option<handoff::HandoffState>>::new(None))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            tracing::debug!("{}, {argv:?}, {cwd}", app.package_info().name);
            tray::show_main_window(app);
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));

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

    let app = builder
        .invoke_handler(tauri::generate_handler![
            cmd::download::download_file,
            cmd::handoff_cmd::handoff_status,
            cmd::handoff_cmd::handoff_start,
            cmd::handoff_cmd::handoff_stop,
            cmd::handoff_cmd::handoff_regenerate_token,
            cmd::keepawake_cmd::keepawake_start,
            cmd::keepawake_cmd::keepawake_stop,
            cmd::app::get_cargo_features,
            cmd::config::write_config_atomically,
            cmd::config::get_config_path,
            tray::set_tray,
            cmd::transcribe::transcribe,
            cmd::files::glob_files,
            cmd::files::pick_media_paths,
            cmd::download::download_model,
            cmd::sona_cmd::load_model,
            cmd::sona_cmd::get_gpu_devices,
            cmd::sona_cmd::get_model_metadata,
            cmd::sona_cmd::get_api_base_url,
            cmd::sona_cmd::start_api_server,
            cmd::sona_cmd::stop_api_server,
            cmd::app::track_analytics_event,
            cmd::app::get_commit_hash,
            cmd::app::is_avx2_enabled,
            cmd::app::is_online,
            cmd::files::get_path_dst,
            cmd::app::get_logs,
            cmd::files::open_path,
            cmd::files::get_save_path,
            cmd::files::get_argv,
            cmd::files::get_default_recording_path,
            cmd::audio::get_audio_devices,
            cmd::audio::start_record,
            cmd::app::get_models_folder,
            cmd::app::get_logs_folder,
            cmd::app::show_log_path,
            cmd::app::show_temp_path,
            cmd::files::get_ffmpeg_path,
            cmd::ytdlp::download_audio,
            cmd::ytdlp::get_temp_path,
            cmd::ytdlp::get_latest_ytdlp_version,
            cmd::app::is_crashed_recently,
            cmd::app::rename_crash_file,
            cmd::app::type_text,
            cmd::permissions::request_system_audio_permission,
            cmd::permissions::open_system_audio_settings,
            dictation_indicator::get_dictation_indicator_enabled,
            dictation_indicator::set_dictation_indicator_enabled,
            dictation_indicator::show_dictation_indicator,
            dictation_indicator::get_dictation_indicator_state,
            dictation_indicator::dictation_indicator_ready,
            dictation_indicator::hide_dictation_indicator
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        // Clicking the dock icon while the window is hidden in the tray has to bring it back;
        // macOS reports the click here rather than as a window event.
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { has_visible_windows, .. } => {
            if !has_visible_windows {
                tray::show_main_window(app);
            }
        }
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            let mutex = app.state::<tokio::sync::Mutex<setup::SonaState>>();
            if let Ok(mut guard) = mutex.try_lock() {
                if let Some(ref mut process) = guard.process {
                    process.kill();
                }
            };
            // Drop the handoff router so the iroh endpoint closes cleanly.
            let handoff = app.state::<tokio::sync::Mutex<Option<handoff::HandoffState>>>();
            if let Ok(mut guard) = handoff.try_lock() {
                guard.take();
            };
        }
        _ => {}
    });
    Ok(())
}
