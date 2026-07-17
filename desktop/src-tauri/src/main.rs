// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod analytics;
mod cleaner;
mod cli;
mod cmd;
mod config;
mod diagnostics;
mod dictation_indicator;
mod error;
mod ffmpeg;
mod logging;
mod setup;
mod sona;
mod transcript;
use tauri::Emitter;

#[cfg(target_os = "macos")]
mod dock;

#[cfg(windows)]
mod custom_protocol;

use eyre::{eyre, Result};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State,
};
use tauri_plugin_store::StoreExt;
use tauri_plugin_window_state::StateFlags;

use error::LogError;

#[derive(Default)]
struct AppLifecycleState {
    quitting: std::sync::atomic::AtomicBool,
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(webview) = app.get_webview_window("main") {
        webview.unminimize().map_err(|e| eyre!("{:?}", e)).log_error();
        webview.show().map_err(|e| eyre!("{:?}", e)).log_error();
        webview.set_focus().map_err(|e| eyre!("{:?}", e)).log_error();
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(webview) = app.get_webview_window("main") {
        webview.hide().map_err(|e| eyre!("{:?}", e)).log_error();
    }
}

pub(crate) fn is_close_to_tray_enabled(app: &AppHandle) -> bool {
    let Ok(store) = app.store(config::STORE_FILENAME) else {
        return true;
    };
    store
        .get("prefs_close_to_tray")
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

#[tokio::main]
async fn main() -> Result<()> {
    // Attach console in Windows:
    #[cfg(all(windows, not(debug_assertions)))]
    cli::attach_console();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .manage(AppLifecycleState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            tracing::debug!("{}, {argv:?}, {cwd}", app.package_info().name);
            show_main_window(app);
            app.emit("single-instance", argv).map_err(|e| eyre!("{:?}", e)).log_error();
        }))
        .setup(|app| {
            setup::setup(app)?;
            analytics::track_event(app, analytics::events::APP_STARTED);

            let show_item = MenuItemBuilder::with_id("show", "Show Vibe").build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "Hide Vibe").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show_item, &hide_item, &quit_item])
                .build()?;
            let icon = app.default_window_icon().cloned().ok_or_else(|| eyre!("missing tray icon"))?;
            let app_handle = app.handle().clone();

            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(&app_handle);
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "hide" => hide_main_window(app),
                    "quit" => {
                        let state: State<'_, AppLifecycleState> = app.state();
                        state
                            .quitting
                            .store(true, std::sync::atomic::Ordering::Relaxed);
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;
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
            cmd::download::download_file,
            cmd::app::get_cargo_features,
            cmd::transcribe::transcribe,
            cmd::files::glob_files,
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
        tauri::RunEvent::ExitRequested { api, .. } => {
            let state: State<'_, AppLifecycleState> = app.state();
            if !state
                .quitting
                .load(std::sync::atomic::Ordering::Relaxed)
                && is_close_to_tray_enabled(app)
            {
                api.prevent_exit();
                hide_main_window(app);
                return;
            }
            let mutex = app.state::<tokio::sync::Mutex<setup::SonaState>>();
            if let Ok(mut guard) = mutex.try_lock() {
                if let Some(ref mut process) = guard.process {
                    process.kill();
                }
            };
        }
        tauri::RunEvent::Exit => {
            let mutex = app.state::<tokio::sync::Mutex<setup::SonaState>>();
            if let Ok(mut guard) = mutex.try_lock() {
                if let Some(ref mut process) = guard.process {
                    process.kill();
                }
            };
        }
        _ => {}
    });
    Ok(())
}
