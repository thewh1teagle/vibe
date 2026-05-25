// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cmd;
mod config;
mod error;
mod ffmpeg;
mod logging;
mod setup;
mod sona;
mod transcript;
use tauri::{Emitter, Manager};

use eyre::{eyre, Result};
use tauri_plugin_window_state::StateFlags;

use error::LogError;

#[tokio::main]
async fn main() -> Result<()> {
	#[allow(unused_mut)]
	let mut builder = tauri::Builder::default()
		.plugin(tauri_plugin_opener::init())
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
			Ok(())
		})
		.plugin(
			tauri_plugin_window_state::Builder::default()
				.with_state_flags(!StateFlags::VISIBLE)
				.build(),
		)
		.plugin(tauri_plugin_store::Builder::default().build())
		.plugin(tauri_plugin_fs::init())
		.plugin(tauri_plugin_os::init())
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_process::init())
		.plugin(tauri_plugin_global_shortcut::Builder::new().build())
		.plugin(tauri_plugin_notification::init());

	#[cfg(feature = "keepawake")]
	{
		builder = builder.plugin(tauri_plugin_keepawake::init());
	}

	let app = builder
		.invoke_handler(tauri::generate_handler![
			cmd::download::download_file,
			cmd::transcribe::transcribe,
			cmd::files::glob_files,
			cmd::download::download_model,
			cmd::sona_cmd::load_model,
			cmd::sona_cmd::get_gpu_devices,
			cmd::sona_cmd::get_api_base_url,
			cmd::sona_cmd::start_api_server,
			cmd::sona_cmd::stop_api_server,
			cmd::app::is_avx2_enabled,
			cmd::app::is_online,
			cmd::files::get_path_dst,
			cmd::files::open_path,
			cmd::files::get_save_path,
			cmd::files::get_default_recording_path,
			cmd::audio::get_audio_devices,
			cmd::audio::start_record,
			cmd::app::get_models_folder,
			cmd::files::get_ffmpeg_path,
			cmd::app::is_crashed_recently,
			cmd::app::rename_crash_file,
			cmd::app::type_text,
			cmd::permissions::request_system_audio_permission,
			cmd::permissions::open_system_audio_settings
		])
		.build(tauri::generate_context!())
		.expect("error while building tauri application");

	app.run(|app, event| match event {
		tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
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
