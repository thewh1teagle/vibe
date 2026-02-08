use tauri::{App, AppHandle};
use tauri_plugin_aptabase::EventTracker;
use tauri_plugin_store::StoreExt;

use crate::config::STORE_FILENAME;

pub mod events {
    pub const APP_STARTED: &str = "app_started";
    pub const CLI_STARTED: &str = "cli_started";
    pub const SONA_SPAWN_FAILED: &str = "sona_spawn_failed";
}

fn is_analytics_enabled(app_handle: &AppHandle) -> bool {
    let Ok(store) = app_handle.store(STORE_FILENAME) else {
        return true; // default to enabled if store unavailable
    };
    store
        .get("analytics_enabled")
        .and_then(|v: serde_json::Value| v.as_bool())
        .unwrap_or(true)
}

pub fn track_event(app: &App, event_name: &str) {
    if !is_analytics_enabled(&app.handle()) {
        return;
    }
    if let Err(error) = app.track_event(event_name, None) {
        tracing::debug!("analytics track_event failed for '{}': {}", event_name, error);
    }
}

pub fn track_event_handle(app_handle: &AppHandle, event_name: &str) {
    track_event_handle_with_props(app_handle, event_name, None);
}

pub fn track_event_handle_with_props(app_handle: &AppHandle, event_name: &str, props: Option<serde_json::Value>) {
    if option_env!("APTABASE_KEY").unwrap_or("").is_empty() {
        tracing::debug!("analytics track_event failed for '{}': APTABASE_KEY is not set", event_name);
        return;
    }
    if !is_analytics_enabled(app_handle) {
        return;
    }
    if let Err(error) = app_handle.track_event(event_name, props) {
        tracing::debug!("analytics track_event failed for '{}': {}", event_name, error);
    }
}
