use crate::config::STORE_FILENAME;
use meeting_detect::{MeetingState, Source};
use serde::Serialize;
use std::sync::mpsc::{self, RecvTimeoutError, TryRecvError};
use std::sync::Mutex;
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "macos")]
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt};

#[cfg(target_os = "macos")]
tauri_nspanel::tauri_panel! {
    panel!(MeetingPromptPanel {
        config: {
            // WebKit needs a key-capable host to route clicks to form controls. The
            // NonactivatingPanel style still prevents this from activating Vibe.
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true,
            becomes_key_only_if_needed: true,
            hides_on_deactivate: false
        }
    })
}

const WINDOW_LABEL: &str = "meeting-prompt";
const ENABLED_KEY: &str = "recording.meetingDetectionEnabled";
const EVENT_NAME: &str = "meeting-prompt-state";
const WIDTH: f64 = 304.0;
const HEIGHT: f64 = 152.0;
const MARGIN: f64 = 20.0;
#[cfg(target_os = "macos")]
const TOP_MARGIN: f64 = 48.0;
#[cfg(not(target_os = "macos"))]
const TOP_MARGIN: f64 = MARGIN;
const POLL_INTERVAL: Duration = Duration::from_millis(750);

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MeetingPromptPayload {
    pub source: Source,
}

#[derive(Default)]
struct PromptLogic {
    detected: Option<Source>,
    current: Option<MeetingPromptPayload>,
    dismissed: bool,
    own_recordings: u32,
}

impl PromptLogic {
    fn detection(&mut self, state: MeetingState) -> bool {
        let before = self.current.clone();
        if !state.recording {
            self.detected = None;
            self.current = None;
            self.dismissed = false;
        } else {
            self.detected = state.source;
            if self.own_recordings > 0 {
                self.dismissed = true;
            }
            self.current = self
                .detected
                .filter(|_| !self.dismissed && self.own_recordings == 0)
                .map(|source| MeetingPromptPayload { source });
        }
        before != self.current
    }

    fn dismiss(&mut self) -> bool {
        if self.detected.is_some() {
            self.dismissed = true;
        }
        self.current.take().is_some()
    }

    fn recording_started(&mut self) -> bool {
        self.own_recordings = self.own_recordings.saturating_add(1);
        if self.detected.is_some() {
            self.dismissed = true;
        }
        self.current.take().is_some()
    }

    fn recording_stopped(&mut self) {
        self.own_recordings = self.own_recordings.saturating_sub(1);
        // Deliberately do not re-show: starting Vibe dismissed this mic session. A detector
        // observation of inactivity is the only event that clears dismissal.
    }

    fn reset_detection(&mut self) {
        self.detected = None;
        self.current = None;
        self.dismissed = false;
    }
}

struct Worker {
    stop: mpsc::Sender<()>,
    handle: Option<JoinHandle<()>>,
}

impl Worker {
    fn stop(mut self) {
        self.stop_inner();
    }

    fn stop_inner(&mut self) {
        let _ = self.stop.send(());
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        self.stop_inner();
    }
}

#[derive(Default)]
struct RuntimeInner {
    logic: PromptLogic,
    worker: Option<Worker>,
}

#[derive(Default)]
pub struct MeetingPromptRuntime {
    inner: Mutex<RuntimeInner>,
}

fn is_enabled(app: &tauri::AppHandle) -> bool {
    app.store(STORE_FILENAME)
        .ok()
        .and_then(|store| store.get(ENABLED_KEY))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn create_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    let window = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html?window=meeting-prompt".into()))
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .focused(false)
        .focusable(false)
        // The prompt intentionally does not activate Vibe. On macOS, WebKit otherwise
        // discards the first click made while another app (the meeting) is active.
        .accept_first_mouse(true)
        .skip_taskbar(true)
        .transparent(true)
        .shadow(false)
        .visible(false)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let has_state = window
                    .app_handle()
                    .try_state::<MeetingPromptRuntime>()
                    .and_then(|runtime| runtime.inner.lock().ok().map(|inner| inner.logic.current.is_some()))
                    .unwrap_or(false);
                if !has_state {
                    let _ = window.hide();
                }
            }
        })
        .build()
        .map_err(|error| error.to_string())?;

    window
        .set_size(LogicalSize::new(WIDTH, HEIGHT))
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    {
        let panel = window.to_panel::<MeetingPromptPanel>().map_err(|error| error.to_string())?;
        panel.set_level(PanelLevel::Floating.value());
        panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
        panel.set_collection_behavior(CollectionBehavior::new().can_join_all_spaces().full_screen_auxiliary().into());
        panel.set_hides_on_deactivate(false);
        panel.set_works_when_modal(true);
        panel.set_transparent(true);
    }

    Ok(window)
}

fn ensure_window(app: &tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window(WINDOW_LABEL).is_none() {
        create_window(app)?;
    }
    Ok(())
}

fn position_window(app: &tauri::AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let cursor = window.cursor_position().map_err(|error| error.to_string())?;
    let monitor = window
        .monitor_from_point(cursor.x, cursor.y)
        .map_err(|error| error.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        let x = position.x as f64 + size.width as f64 - (WIDTH + MARGIN) * scale;
        let y = position.y as f64 + TOP_MARGIN * scale;
        window
            .set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
            .map_err(|error| error.to_string())?;
    } else if let Some(main) = app.get_webview_window("main") {
        let position = main.outer_position().map_err(|error| error.to_string())?;
        window
            .set_position(PhysicalPosition::new(position.x + MARGIN as i32, position.y + MARGIN as i32))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn show_window_without_focus(app: &tauri::AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let _ = window;
    let panel = app
        .get_webview_panel(WINDOW_LABEL)
        .map_err(|_| "meeting prompt panel is not initialized".to_string())?;
    app.run_on_main_thread(move || panel.order_front_regardless())
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
fn show_window_without_focus(_app: &tauri::AppHandle, window: &WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())
}

fn hide_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.hide();
    }
}

fn show_state(app: &tauri::AppHandle, state: MeetingPromptPayload) -> Result<(), String> {
    if !is_enabled(app) {
        return Ok(());
    }
    tracing::debug!(source = ?state.source, "showing meeting prompt");
    let window = match app.get_webview_window(WINDOW_LABEL) {
        Some(window) => window,
        None => create_window(app)?,
    };
    position_window(app, &window)?;
    show_window_without_focus(app, &window)?;
    window.emit(EVENT_NAME, state).map_err(|error| error.to_string())
}

fn apply_detection(app: &tauri::AppHandle, state: MeetingState) {
    tracing::debug!(recording = state.recording, source = ?state.source, "meeting detector state changed");
    let Some(runtime) = app.try_state::<MeetingPromptRuntime>() else {
        return;
    };
    let next = {
        let Ok(mut inner) = runtime.inner.lock() else {
            return;
        };
        if !inner.logic.detection(state) {
            return;
        }
        inner.logic.current.clone()
    };
    match next {
        Some(state) => {
            if let Err(error) = show_state(app, state) {
                tracing::error!("could not show meeting prompt: {error}");
            }
        }
        None => hide_window(app),
    }
}

fn start_worker(app: &tauri::AppHandle) -> Result<(), String> {
    let runtime = app
        .try_state::<MeetingPromptRuntime>()
        .ok_or_else(|| "meeting prompt runtime is not initialized".to_string())?;
    let mut inner = runtime.inner.lock().map_err(|error| error.to_string())?;
    if inner.worker.is_some() {
        return Ok(());
    }
    tracing::debug!("starting meeting detector");
    let (stop, stop_receiver) = mpsc::channel();
    let worker_app = app.clone();
    let handle = std::thread::Builder::new()
        .name("meeting-prompt".into())
        .spawn(move || {
            let detector = meeting_detect::watch(POLL_INTERVAL);
            loop {
                match stop_receiver.try_recv() {
                    Ok(()) | Err(TryRecvError::Disconnected) => break,
                    Err(TryRecvError::Empty) => {}
                }
                match detector.recv_timeout(Duration::from_millis(200)) {
                    Ok(state) => apply_detection(&worker_app, state),
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
            drop(detector);
        })
        .map_err(|error| error.to_string())?;
    inner.worker = Some(Worker {
        stop,
        handle: Some(handle),
    });
    Ok(())
}

fn stop_worker(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(runtime) = app.try_state::<MeetingPromptRuntime>() else {
        return Ok(());
    };
    let worker = {
        let mut inner = runtime.inner.lock().map_err(|error| error.to_string())?;
        // Keep Vibe's own recording count across a disable/re-enable cycle. Otherwise enabling
        // detection during an existing recording could prompt for Vibe's microphone session.
        inner.logic.reset_detection();
        inner.worker.take()
    };
    if let Some(worker) = worker {
        worker.stop();
    }
    hide_window(app);
    Ok(())
}

/// Install runtime state and start polling only when the persisted opt-in is enabled.
pub fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    if app.try_state::<MeetingPromptRuntime>().is_none() {
        app.manage(MeetingPromptRuntime::default());
    }
    // Build the interactive panel while Vibe is launching. It stays hidden and costs no detector
    // polling while the feature is disabled; retaining it is what lets macOS deliver clicks later
    // without activating the app or bringing the main window over the meeting.
    ensure_window(app)?;
    if is_enabled(app) {
        start_worker(app)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_meeting_detection_enabled(app: tauri::AppHandle) -> bool {
    is_enabled(&app)
}

#[tauri::command]
pub fn set_meeting_detection_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let store = app.store(STORE_FILENAME).map_err(|error| error.to_string())?;
    store.set(ENABLED_KEY, serde_json::Value::Bool(enabled));
    store.save().map_err(|error| error.to_string())?;
    if enabled {
        ensure_window(&app)?;
        start_worker(&app)
    } else {
        stop_worker(&app)?;
        Ok(())
    }
}

#[tauri::command]
pub fn get_meeting_prompt_state(app: tauri::AppHandle) -> Result<Option<MeetingPromptPayload>, String> {
    let runtime = app
        .try_state::<MeetingPromptRuntime>()
        .ok_or_else(|| "meeting prompt runtime is not initialized".to_string())?;
    runtime
        .inner
        .lock()
        .map(|inner| inner.logic.current.clone())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn dismiss_meeting_prompt(app: tauri::AppHandle) -> Result<(), String> {
    let runtime = app
        .try_state::<MeetingPromptRuntime>()
        .ok_or_else(|| "meeting prompt runtime is not initialized".to_string())?;
    if runtime.inner.lock().map_err(|error| error.to_string())?.logic.dismiss() {
        hide_window(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn meeting_prompt_ready(window: tauri::WebviewWindow) -> Result<(), String> {
    let app = window.app_handle();
    let state = get_meeting_prompt_state(app.clone())?;
    if let Some(state) = state {
        position_window(app, &window)?;
        show_window_without_focus(app, &window)?;
        window.emit(EVENT_NAME, state).map_err(|error| error.to_string())?;
    } else {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn recording_started(app: &tauri::AppHandle) {
    let Some(runtime) = app.try_state::<MeetingPromptRuntime>() else {
        return;
    };
    let hide = runtime
        .inner
        .lock()
        .map(|mut inner| inner.logic.recording_started())
        .unwrap_or(false);
    if hide {
        hide_window(app);
    }
}

pub fn recording_stopped(app: &tauri::AppHandle) {
    let Some(runtime) = app.try_state::<MeetingPromptRuntime>() else {
        return;
    };
    if let Ok(mut inner) = runtime.inner.lock() {
        inner.logic.recording_stopped();
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zoom(active: bool) -> MeetingState {
        MeetingState {
            recording: active,
            source: active.then_some(Source::Zoom),
        }
    }

    #[test]
    fn dismissal_lasts_until_the_detected_session_ends() {
        let mut state = PromptLogic::default();
        state.detection(zoom(true));
        assert!(state.current.is_some());
        state.dismiss();
        state.detection(zoom(true));
        assert!(state.current.is_none());
        state.detection(zoom(false));
        state.detection(zoom(true));
        assert!(state.current.is_some());
    }

    #[test]
    fn vibe_recording_dismisses_the_whole_current_mic_session() {
        let mut state = PromptLogic::default();
        state.detection(zoom(true));
        assert!(state.recording_started());
        state.recording_stopped();
        state.detection(zoom(true));
        assert!(state.current.is_none());
        state.detection(zoom(false));
        state.detection(zoom(true));
        assert!(state.current.is_some());
    }

    #[test]
    fn meeting_detected_during_vibe_recording_is_also_suppressed_until_mic_release() {
        let mut state = PromptLogic::default();
        state.recording_started();
        state.detection(zoom(true));
        state.recording_stopped();
        assert!(state.current.is_none());
        state.detection(zoom(false));
        state.detection(zoom(true));
        assert!(state.current.is_some());
    }
}
