use tauri::App;
use tauri_plugin_aptabase::EventTracker;

pub mod events {
    pub const APP_STARTED: &str = "app_started";
}

pub fn track_event(app: &App, event_name: &str) {
    if let Err(error) = app.track_event(event_name, None) {
        tracing::debug!("analytics track_event failed for '{}': {}", event_name, error);
    }
}
