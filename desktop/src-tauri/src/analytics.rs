use tauri::{App, AppHandle};
use tauri_plugin_aptabase::EventTracker;
use tauri_plugin_store::StoreExt;

use crate::config::STORE_FILENAME;

pub const APTABASE_APP_KEY: &str = match option_env!("APTABASE_APP_KEY") {
    Some(v) => v,
    None => "",
};

pub const APTABASE_BASE_URL: &str = match option_env!("APTABASE_BASE_URL") {
    Some(v) => v,
    None => "",
};

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

pub fn is_aptabase_configured() -> bool {
    !APTABASE_APP_KEY.is_empty() && !APTABASE_BASE_URL.is_empty()
}

pub fn track_event(app: &App, event_name: &str) {
    track_event_handle_with_props(app.handle(), event_name, None);
}

pub fn track_event_handle(app_handle: &AppHandle, event_name: &str) {
    track_event_handle_with_props(app_handle, event_name, None);
}

pub fn track_event_handle_with_props(app_handle: &AppHandle, event_name: &str, props: Option<serde_json::Value>) {
    if !is_aptabase_configured() {
        tracing::debug!(
            "analytics track_event failed for '{}': APTABASE_APP_KEY or APTABASE_BASE_URL is not set",
            event_name
        );
        return;
    }
    if !is_analytics_enabled(app_handle) {
        return;
    }
    let mut merged = match props {
        Some(serde_json::Value::Object(m)) => m,
        _ => serde_json::Map::new(),
    };
    merged.entry("vibe_commit").or_insert_with(|| env!("COMMIT_HASH").into());
    tracing::trace!("analytics track_event '{}' sent", event_name);
    if let Err(error) = app_handle.track_event(event_name, Some(serde_json::Value::Object(merged))) {
        tracing::debug!("analytics track_event failed for '{}': {}", event_name, error);
    }
}
