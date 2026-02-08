use tauri::{App, AppHandle};
use tauri_plugin_aptabase::EventTracker;

pub mod events {
    pub const APP_STARTED: &str = "app_started";
    pub const CLI_STARTED: &str = "cli_started";
    pub const SONA_SPAWN_FAILED: &str = "sona_spawn_failed";
}

pub fn track_event(app: &App, event_name: &str) {
    if let Err(error) = app.track_event(event_name, None) {
        tracing::debug!("analytics track_event failed for '{}': {}", event_name, error);
    }
}

pub fn track_event_handle(app_handle: &AppHandle, event_name: &str) {
    if option_env!("APTABASE_KEY").unwrap_or("").is_empty() {
        return;
    }
    if let Err(error) = app_handle.track_event(event_name, None) {
        tracing::debug!("analytics track_event failed for '{}': {}", event_name, error);
    }
}
