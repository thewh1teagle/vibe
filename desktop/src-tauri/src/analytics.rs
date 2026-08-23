use std::sync::OnceLock;
use std::time::Duration;

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
    /// Clean shutdown. Its absence after `app_started` means the app crashed.
    pub const APP_EXITED: &str = "app_exited";
    pub const CLI_STARTED: &str = "cli_started";
    /// Sona finished under the CLI: carries the exit code and wall-clock duration.
    pub const CLI_FINISHED: &str = "cli_finished";
    pub const CLI_SPAWN_FAILED: &str = "cli_spawn_failed";
    pub const SONA_SPAWN_FAILED: &str = "sona_spawn_failed";

    // Phone handoff. Props are technical facts only: never a transcript, filename,
    // saved path, endpoint id, pairing token, model path, or chosen language.
    pub const HANDOFF_ENABLED: &str = "handoff_enabled";
    pub const HANDOFF_DISABLED: &str = "handoff_disabled";
    pub const HANDOFF_TRANSCRIBE: &str = "handoff_transcribe";
    pub const HANDOFF_CAPABILITIES: &str = "handoff_capabilities";
    pub const HANDOFF_PAIRING_REGENERATED: &str = "handoff_pairing_regenerated";
}

/// Store key holding the anonymous install id.
const INSTALL_ID_KEY: &str = "analytics_install_id";

/// The Aptabase ingest server truncates prop values at 180 characters.
const MAX_PROP_CHARS: usize = 180;

/// Marks where `truncate_keep_tail` cut the string.
const ELISION_MARKER: &str = "...";

/// Resolved once per process so a store that cannot be written is not retried on every event.
static INSTALL_ID: OnceLock<String> = OnceLock::new();

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

/// Anonymous, locally generated install id: a random UUID v4, never derived from the
/// machine, the hardware, or anything else identifying. Created on first use and
/// persisted so it survives restarts. Returns `None` when the store cannot hold it,
/// so an unwritable store omits the prop instead of sending a fresh id per event.
fn install_id(app_handle: &AppHandle) -> Option<String> {
    if let Some(id) = INSTALL_ID.get() {
        return Some(id.clone());
    }
    let store = app_handle.store(STORE_FILENAME).ok()?;
    let existing = store
        .get(INSTALL_ID_KEY)
        .and_then(|value: serde_json::Value| value.as_str().map(str::to_string))
        .filter(|id| !id.is_empty());
    let id = match existing {
        Some(id) => id,
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            store.set(INSTALL_ID_KEY, serde_json::Value::String(id.clone()));
            if let Err(error) = store.save() {
                // Leave nothing behind, so the next event does not see a half-written id.
                store.delete(INSTALL_ID_KEY);
                tracing::debug!("analytics install id could not be persisted: {}", error);
                return None;
            }
            id
        }
    };
    Some(INSTALL_ID.get_or_init(|| id).clone())
}

/// Truncate `value` to `max_chars` characters keeping the END of the string.
/// Error messages carry a stderr tail and the tail is the half worth having, so the
/// front is what gets elided. Counting characters (not bytes) keeps the cut on a
/// UTF-8 char boundary.
fn truncate_keep_tail(value: &str, max_chars: usize) -> String {
    let total = value.chars().count();
    if total <= max_chars {
        return value.to_string();
    }
    let marker_chars = ELISION_MARKER.chars().count();
    if max_chars <= marker_chars {
        return value.chars().skip(total - max_chars).collect();
    }
    let tail: String = value.chars().skip(total - (max_chars - marker_chars)).collect();
    format!("{}{}", ELISION_MARKER, tail)
}

/// Flush pending events without letting a slow network hold up an exit.
pub fn flush_events_bounded(app_handle: &AppHandle, timeout: Duration) {
    if !is_aptabase_configured() {
        return;
    }
    let (sender, receiver) = std::sync::mpsc::channel();
    let handle = app_handle.clone();
    // flush_events_blocking ends in a reqwest call, which panics without a tokio runtime in
    // scope. A bare thread has none, and the release profile aborts on panic, so that panic
    // took the whole app down on quit rather than just losing the flush. Carry the runtime in.
    let runtime = tauri::async_runtime::handle();
    std::thread::spawn(move || {
        let _guard = runtime.inner().enter();
        handle.flush_events_blocking();
        let _ = sender.send(());
    });
    if receiver.recv_timeout(timeout).is_err() {
        tracing::debug!("analytics flush timed out after {:?}", timeout);
    }
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
    if let Some(serde_json::Value::String(message)) = merged.get("error_message") {
        let truncated = truncate_keep_tail(message, MAX_PROP_CHARS);
        if truncated != *message {
            merged.insert("error_message".to_string(), truncated.into());
        }
    }
    merged.entry("vibe_commit").or_insert_with(|| env!("COMMIT_HASH").into());
    if let Some(id) = install_id(app_handle) {
        merged.entry("install_id").or_insert_with(|| id.into());
    }
    tracing::trace!("analytics track_event '{}' sent", event_name);
    if let Err(error) = app_handle.track_event(event_name, Some(serde_json::Value::Object(merged))) {
        tracing::debug!("analytics track_event failed for '{}': {}", event_name, error);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shorter_than_limit_is_untouched() {
        let message = "failed to spawn sona";
        assert_eq!(truncate_keep_tail(message, MAX_PROP_CHARS), message);
        // Exactly at the limit is still untouched.
        let exact: String = "a".repeat(MAX_PROP_CHARS);
        assert_eq!(truncate_keep_tail(&exact, MAX_PROP_CHARS), exact);
    }

    #[test]
    fn much_longer_keeps_the_tail() {
        let message = format!("{}stderr tail that matters", "noise ".repeat(200));
        let truncated = truncate_keep_tail(&message, MAX_PROP_CHARS);
        assert_eq!(truncated.chars().count(), MAX_PROP_CHARS);
        assert!(truncated.starts_with(ELISION_MARKER));
        assert!(truncated.ends_with("stderr tail that matters"));
    }

    #[test]
    fn multi_byte_chars_cut_on_a_char_boundary() {
        // Each char is 3 bytes, so a byte-index cut would land mid-character.
        let message: String = "שלום".repeat(200);
        let truncated = truncate_keep_tail(&message, MAX_PROP_CHARS);
        assert_eq!(truncated.chars().count(), MAX_PROP_CHARS);
        assert!(truncated.starts_with(ELISION_MARKER));
        assert!(message.ends_with(truncated.trim_start_matches(ELISION_MARKER)));
        // Emoji (4 bytes each) mixed with ASCII behaves the same.
        let emoji = format!("{}done 🎉", "🎧".repeat(300));
        let truncated = truncate_keep_tail(&emoji, MAX_PROP_CHARS);
        assert_eq!(truncated.chars().count(), MAX_PROP_CHARS);
        assert!(truncated.ends_with("done 🎉"));
    }

    #[test]
    fn limit_at_or_below_the_marker_keeps_only_the_tail() {
        assert_eq!(truncate_keep_tail("abcdef", 3), "def");
        assert_eq!(truncate_keep_tail("abcdef", 2), "ef");
        assert_eq!(truncate_keep_tail("abcdef", 4), "...f");
    }

    #[test]
    fn install_id_looks_like_an_anonymous_uuid_v4() {
        let id = uuid::Uuid::new_v4().to_string();
        let parsed = uuid::Uuid::parse_str(&id).unwrap();
        assert_eq!(parsed.get_version_num(), 4);
        assert_ne!(id, uuid::Uuid::new_v4().to_string());
    }
}
