use crate::config::STORE_FILENAME;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::webview::PageLoadEvent;
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

const WINDOW_LABEL: &str = "dictation-indicator";
const ENABLED_KEY: &str = "dictation_indicator_enabled";
const WIDTH: f64 = 280.0;
const HEIGHT: f64 = 64.0;
const BOTTOM_MARGIN: f64 = 48.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationIndicatorPayload {
    pub session_id: u64,
    pub status: String,
    pub output: Option<String>,
    pub message: Option<String>,
}

#[derive(Default)]
pub struct DictationIndicatorRuntime {
    current: Mutex<Option<DictationIndicatorPayload>>,
}

pub fn is_enabled(app: &tauri::AppHandle) -> bool {
    app.store(STORE_FILENAME)
        .ok()
        .and_then(|store| store.get(ENABLED_KEY))
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

fn create_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    let window = WebviewWindowBuilder::new(
        app,
        WINDOW_LABEL,
        WebviewUrl::App("index.html?window=dictation-indicator".into()),
    )
    .inner_size(WIDTH, HEIGHT)
    .decorations(false)
    .resizable(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .focused(false)
    .focusable(false)
    .skip_taskbar(true)
    .transparent(true)
    .shadow(false)
    .visible(true)
    .on_page_load(|window, payload| {
        if payload.event() == PageLoadEvent::Finished {
            tracing::info!("Dictation indicator page loaded: {}", payload.url());
            let has_active_state = window
                .app_handle()
                .state::<DictationIndicatorRuntime>()
                .current
                .lock()
                .is_ok_and(|state| state.is_some());
            if !has_active_state {
                let _ = window.hide();
            }
        }
    })
    .build()
    .map_err(|error| error.to_string())?;

    window
        .set_size(LogicalSize::new(WIDTH, HEIGHT))
        .map_err(|error| error.to_string())?;
    window.set_ignore_cursor_events(true).map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    unsafe {
        use objc2_app_kit::{NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior};

        let native_window: &NSWindow = &*window.ns_window().map_err(|error| error.to_string())?.cast();
        native_window.setCollectionBehavior(
            native_window.collectionBehavior()
                | NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary,
        );
        native_window.setLevel(NSStatusWindowLevel);
        native_window.setOpaque(false);
    }
    position_window(app, &window)?;
    Ok(window)
}

pub fn initialize(app: &tauri::AppHandle) {
    tracing::info!("Initializing dictation indicator (enabled={})", is_enabled(app));
    if is_enabled(app) && app.get_webview_window(WINDOW_LABEL).is_none() {
        if let Err(error) = create_window(app) {
            tracing::error!("Could not initialize dictation indicator: {error}");
        } else {
            tracing::info!("Dictation indicator window initialized hidden");
        }
    }
}

fn position_window(app: &tauri::AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let cursor = window.cursor_position().map_err(|error| error.to_string())?;
    let monitor = window
        .monitor_from_point(cursor.x, cursor.y)
        .map_err(|error| error.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let width = WIDTH * scale;
        let height = HEIGHT * scale;
        let x = monitor_position.x as f64 + (monitor_size.width as f64 - width) / 2.0;
        let y = monitor_position.y as f64 + monitor_size.height as f64 - height - BOTTOM_MARGIN * scale;
        window
            .set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
            .map_err(|error| error.to_string())?;
    } else if let Some(main) = app.get_webview_window("main") {
        window
            .set_position(main.outer_position().map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_dictation_indicator_enabled(app: tauri::AppHandle) -> bool {
    is_enabled(&app)
}

#[tauri::command]
pub fn set_dictation_indicator_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let store = app.store(STORE_FILENAME).map_err(|error| error.to_string())?;
    store.set(ENABLED_KEY, serde_json::Value::Bool(enabled));
    store.save().map_err(|error| error.to_string())?;
    if !enabled {
        *app.state::<DictationIndicatorRuntime>()
            .current
            .lock()
            .map_err(|error| error.to_string())? = None;
        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
            window.close().map_err(|error| error.to_string())?;
        }
    } else if app.get_webview_window(WINDOW_LABEL).is_none() {
        create_window(&app)?;
    }
    Ok(())
}

#[tauri::command]
pub fn show_dictation_indicator(app: tauri::AppHandle, state: DictationIndicatorPayload) -> Result<(), String> {
    tracing::info!(
        "Showing dictation indicator: status={}, session={}",
        state.status,
        state.session_id
    );
    if !is_enabled(&app) {
        tracing::info!("Dictation indicator show skipped because it is disabled");
        return Ok(());
    }
    *app.state::<DictationIndicatorRuntime>()
        .current
        .lock()
        .map_err(|error| error.to_string())? = Some(state.clone());
    let window = match app.get_webview_window(WINDOW_LABEL) {
        Some(window) => window,
        None => create_window(&app)?,
    };
    window
        .set_size(LogicalSize::new(WIDTH, HEIGHT))
        .map_err(|error| error.to_string())?;
    if let Err(error) = position_window(&app, &window) {
        tracing::error!("Could not position dictation indicator: {error}");
    }
    window.show().map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    unsafe {
        use objc2_app_kit::{NSStatusWindowLevel, NSWindow};

        let native_window: &NSWindow = &*window.ns_window().map_err(|error| error.to_string())?.cast();
        native_window.setLevel(NSStatusWindowLevel);
        native_window.orderFrontRegardless();
    }
    if let Err(error) = window.emit("dictation-indicator-state", state) {
        tracing::error!("Could not update dictation indicator: {error}");
    }
    tracing::info!(
        "Dictation indicator shown (visible={:?}, position={:?}, size={:?}, title={:?}, url={:?})",
        window.is_visible(),
        window.outer_position(),
        window.outer_size(),
        window.title(),
        window.url()
    );
    Ok(())
}

#[tauri::command]
pub fn get_dictation_indicator_state(app: tauri::AppHandle) -> Result<Option<DictationIndicatorPayload>, String> {
    app.state::<DictationIndicatorRuntime>()
        .current
        .lock()
        .map(|state| state.clone())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn dictation_indicator_ready(window: tauri::WebviewWindow) {
    tracing::info!(
        "Dictation indicator webview ready: label={}, url={:?}",
        window.label(),
        window.url()
    );
}

#[tauri::command]
pub fn hide_dictation_indicator(app: tauri::AppHandle, session_id: u64) -> Result<(), String> {
    tracing::info!("Hiding dictation indicator: session={session_id}");
    let runtime = app.state::<DictationIndicatorRuntime>();
    let mut current = runtime.current.lock().map_err(|error| error.to_string())?;
    if current.as_ref().is_some_and(|state| state.session_id == session_id) {
        *current = None;
        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
            window.hide().map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}
