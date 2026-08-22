use crate::{
    cli::{self, is_cli_detected},
    config::STORE_FILENAME,
    diagnostics::get_issue_url,
    error::LogError,
    sona::SonaProcess,
};
use eyre::eyre;
use once_cell::sync::Lazy;
use std::fs;
use tauri::{App, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

pub static STATIC_APP: Lazy<std::sync::Mutex<Option<tauri::AppHandle>>> = Lazy::new(|| std::sync::Mutex::new(None));

pub struct SonaState {
    pub process: Option<SonaProcess>,
}

pub fn setup(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    // Create app directories
    let local_app_data_dir = app.path().app_local_data_dir()?;
    let app_config_dir = app.path().app_config_dir()?;
    fs::create_dir_all(&local_app_data_dir)
        .unwrap_or_else(|_| panic!("cant create local app data directory at {}", local_app_data_dir.display()));
    fs::create_dir_all(&app_config_dir)
        .unwrap_or_else(|_| panic!("cant create app config directory at {}", app_config_dir.display()));

    // Manage sona state
    app.manage(Mutex::new(SonaState { process: None }));
    app.manage(crate::dictation_indicator::DictationIndicatorRuntime::default());

    let store = app.store(STORE_FILENAME)?;

    // Setup logging to terminal
    {
        let mut app_handle = STATIC_APP.lock().expect("lock");
        *app_handle = Some(app.handle().clone());
    }
    crate::logging::setup_logging(app.handle(), store).unwrap();
    crate::cleaner::clean_old_logs(app.handle()).log_error();
    crate::cleaner::clean_old_files().log_error();
    crate::cleaner::clean_updater_files().log_error();
    tracing::debug!("Vibe App Running");

    // Settings live in app_config.json so a person or an agent can edit it directly; the store
    // plugin never re-reads the file, so a watcher has to push external edits into it.
    match crate::config_watcher::start(app.handle()) {
        // Kept in state so the watcher lives as long as the app.
        Ok(watcher) => {
            app.manage(watcher);
        }
        Err(error) => tracing::error!("could not start config watcher: {:?}", error),
    }

    // Crash handler

    let _handler = crash_handler::CrashHandler::attach(unsafe {
        crash_handler::make_crash_event(move |cc: &crash_handler::CrashContext| {
            #[cfg(windows)]
            let info = cc.exception_code;

            #[cfg(windows)]
            tracing::error!("Crash exception code: {}", info);

            #[cfg(target_os = "macos")]
            let info = cc.exception;

            #[cfg(target_os = "linux")]
            let info = cc.siginfo;

            #[cfg(unix)]
            tracing::error!("Crash exception code: {:?}", info);

            if let Some(app_handle) = STATIC_APP.lock().expect("lock").as_ref() {
                app_handle
                    .dialog()
                    .message("App crashed with error. Please register to Github and then click report.")
                    .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                    .title("Vibe Crashed")
                    .buttons(MessageDialogButtons::OkCustom("Report".into()))
                    .show(|_| {});
                let _ = tauri_plugin_opener::open_url(get_issue_url(format!("{:?}", info)), None::<&str>);
            }

            crash_handler::CrashEventResult::Handled(true)
        })
    });

    // Log some useful data
    if let Ok(version) = tauri::webview_version() {
        tracing::debug!("webview version: {}", version);
    }

    #[cfg(windows)]
    {
        if let Err(error) = crate::custom_protocol::register() {
            tracing::error!("{:?}", error);
        }
    }

    tracing::debug!("AVX2: {}", crate::cmd::app::is_avx2_enabled());
    tracing::debug!("Executable Architecture: {}", std::env::consts::ARCH);

    tracing::debug!("APP VERSION: {}", app.package_info().version.to_string());
    tracing::debug!("COMMIT HASH: {}", env!("COMMIT_HASH"));
    tracing::debug!("App Info: {}", crate::diagnostics::get_app_info());

    let app_handle = app.app_handle().clone();
    if is_cli_detected() {
        tracing::debug!("CLI mode");
        tauri::async_runtime::spawn(async move {
            cli::run(&app_handle).await.map_err(|e| eyre!("{:?}", e)).log_error();
        });
    } else {
        tracing::debug!("Non CLI mode");
        // Create main window
        let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .inner_size(800.0, 700.0)
            .min_inner_size(800.0, 700.0)
            .center()
            .title("Vibe")
            .resizable(true)
            .focused(true)
            .shadow(true)
            .visible(true);
        // The web content extends under the titlebar so the sidebar toggle can sit
        // beside the traffic lights (ChatGPT-desktop style); the topbar is a drag region.
        #[cfg(target_os = "macos")]
        let builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            // Centered on the 56px titlebar row so the lights align with the sidebar toggle.
            .traffic_light_position(tauri::LogicalPosition::new(16.0, 28.0))
            .transparent(true);
        match builder.build() {
            Ok(_window) => {
                // Glass sidebar: the window is transparent on macOS and an NSVisualEffectView
                // shows the blurred desktop wherever the web content leaves alpha (the sidebar).
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                    if let Err(error) = apply_vibrancy(&_window, NSVisualEffectMaterial::Sidebar, None, None) {
                        tracing::warn!("failed to apply vibrancy: {:?}", error);
                    }
                }
            }
            Err(error) => {
                tracing::error!("{:?}", error);
            }
        }
        crate::dictation_indicator::initialize(app.handle());
    }
    Ok(())
}
