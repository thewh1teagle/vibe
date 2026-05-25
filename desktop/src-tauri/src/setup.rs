use crate::{config::STORE_FILENAME, sona::SonaProcess};
use once_cell::sync::Lazy;
use std::fs;
use tauri::{App, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

pub static STATIC_APP: Lazy<std::sync::Mutex<Option<tauri::AppHandle>>> = Lazy::new(|| std::sync::Mutex::new(None));

pub struct SonaState {
	pub process: Option<SonaProcess>,
	pub loaded_model_path: Option<String>,
	pub loaded_gpu_device: Option<i32>,
}

pub fn setup(app: &App) -> Result<(), Box<dyn std::error::Error>> {
	let local_app_data_dir = app.path().app_local_data_dir()?;
	let app_config_dir = app.path().app_config_dir()?;
	fs::create_dir_all(&local_app_data_dir).unwrap_or_else(|_| panic!("cant create local app data directory at {}", local_app_data_dir.display()));
	fs::create_dir_all(&app_config_dir).unwrap_or_else(|_| panic!("cant create app config directory at {}", app_config_dir.display()));

	app.manage(Mutex::new(SonaState {
		process: None,
		loaded_model_path: None,
		loaded_gpu_device: None,
	}));

	let store = app.store(STORE_FILENAME)?;

	{
		let mut app_handle = STATIC_APP.lock().expect("lock");
		*app_handle = Some(app.handle().clone());
	}
	crate::logging::setup_logging(app.handle(), store).unwrap();
	tracing::debug!("Vibe App Running");

	let _handler = crash_handler::CrashHandler::attach(unsafe {
		crash_handler::make_crash_event(move |cc: &crash_handler::CrashContext| {
			#[cfg(windows)]
			{
				tracing::error!("Crash exception code: {}", cc.exception_code);
			}
			#[cfg(target_os = "macos")]
			{
				tracing::error!("Crash exception code: {:?}", cc.exception);
			}
			#[cfg(target_os = "linux")]
			{
				tracing::error!("Crash exception code: {:?}", cc.siginfo);
			}

			if let Some(app_handle) = STATIC_APP.lock().expect("lock").as_ref() {
				app_handle
					.dialog()
					.message("App crashed with error. Please register to Github and then click report.")
					.kind(tauri_plugin_dialog::MessageDialogKind::Error)
					.title("Vibe Crashed")
					.buttons(MessageDialogButtons::OkCustom("Report".into()))
					.show(|_| {});
			}

			crash_handler::CrashEventResult::Handled(true)
		})
	});

	if let Ok(version) = tauri::webview_version() {
		tracing::debug!("webview version: {}", version);
	}

	tracing::debug!("AVX2: {}", crate::cmd::app::is_avx2_enabled());
	tracing::debug!("Executable Architecture: {}", std::env::consts::ARCH);
	tracing::debug!("APP VERSION: {}", app.package_info().version.to_string());
	tracing::debug!("COMMIT HASH: {}", env!("COMMIT_HASH"));

	let result = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
		.inner_size(420.0, 260.0)
		.min_inner_size(340.0, 200.0)
		.center()
		.title("Vibe")
		.resizable(true)
		.focused(true)
		.shadow(true)
		.visible(true)
		.build();
	if let Err(error) = result {
		tracing::error!("{:?}", error);
	}

	Ok(())
}
