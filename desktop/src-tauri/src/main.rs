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
mod tray;
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
			tray::create_tray(app.handle())?;
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
		.plugin(tauri_plugin_notification::init())
		.on_window_event(|window, event| {
			if let tauri::WindowEvent::CloseRequested { api, .. } = event {
				if window.label() == "main" {
					window.hide().ok();
					api.prevent_close();
				}
			}
		});

	let app = builder
		.invoke_handler(tauri::generate_handler![
			cmd::transcribe::transcribe,
			cmd::download::download_model,
			cmd::sona_cmd::load_model,
			cmd::sona_cmd::preload_model,
			cmd::sona_cmd::get_gpu_devices,
			cmd::app::is_avx2_enabled,
			cmd::app::is_online,
			cmd::files::open_path,
			cmd::audio::get_audio_devices,
			cmd::audio::start_record,
			cmd::app::get_models_folder,
			cmd::app::is_crashed_recently,
			cmd::app::rename_crash_file,
			cmd::app::type_text,
		])
		.build(tauri::generate_context!())
		.expect("error while building tauri application");

	app.run(|app, event| match event {
		tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
			let mutex = app.state::<tokio::sync::Mutex<setup::SonaState>>();
			tokio::task::block_in_place(|| {
				let handle = tokio::runtime::Handle::current();
				match handle.block_on(async {
					tokio::time::timeout(std::time::Duration::from_secs(2), mutex.lock()).await
				}) {
					Ok(mut guard) => {
						if let Some(ref mut process) = guard.process {
							process.kill();
						}
					}
					Err(_) => {
						eprintln!("failed to acquire sona state lock on exit, sona process may be orphaned");
					}
				}
			});
		}
		_ => {}
	});
	Ok(())
}
