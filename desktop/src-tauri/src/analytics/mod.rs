mod client;

use std::sync::OnceLock;
use std::time::Duration;

use tauri::{App, AppHandle};
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
    /// Server finished under the CLI: carries the exit code and wall-clock duration.
    pub const CLI_FINISHED: &str = "cli_finished";
    pub const CLI_SPAWN_FAILED: &str = "cli_spawn_failed";
    /// The string predates the rename; keeping it keeps the dashboards continuous.
    pub const SERVER_SPAWN_FAILED: &str = "sona_spawn_failed";
    /// The engine died with an illegal instruction on the AVX2 build and was relaunched on the baseline one.
    pub const SERVER_CPU_BASELINE_FALLBACK: &str = "server_cpu_baseline_fallback";

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

/// Set by `init` when the build carries a valid key; without one every event is dropped.
static CLIENT: OnceLock<client::Client> = OnceLock::new();

/// Starts the client and its periodic flush. Call once, from setup, before the first event.
pub fn init(app: &App) {
    if !is_aptabase_configured() {
        return;
    }
    let Some(url) = client::ingest_url(APTABASE_APP_KEY, APTABASE_BASE_URL) else {
        tracing::debug!("analytics disabled: the Aptabase app key is not valid");
        return;
    };
    let version = app.package_info().version.to_string();
    if CLIENT.set(client::Client::new(APTABASE_APP_KEY, url, version)).is_err() {
        return;
    }
    tauri::async_runtime::spawn(async {
        loop {
            tokio::time::sleep(client::FLUSH_INTERVAL).await;
            if let Some(client) = CLIENT.get() {
                client.flush().await;
            }
        }
    });
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

/// Send what is queued, giving up after `timeout` so a slow network cannot hold anything up.
pub async fn flush_events(timeout: Duration) {
    let Some(client) = CLIENT.get() else { return };
    if tokio::time::timeout(timeout, client.flush()).await.is_err() {
        tracing::debug!("analytics flush timed out after {:?}", timeout);
    }
}

/// `flush_events` for the exit handler, which is not async. The main thread already sits inside
/// `#[tokio::main]`, where starting another `block_on` panics (and the release profile aborts on
/// panic), so the flush runs on a thread of its own.
pub fn flush_events_bounded(timeout: Duration) {
    if CLIENT.get().is_none() {
        return;
    }
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        tauri::async_runtime::block_on(flush_events(timeout));
        let _ = sender.send(());
    });
    // A little longer than the flush's own timeout, so that one decides.
    let _ = receiver.recv_timeout(timeout + Duration::from_millis(200));
}

pub fn track_event(app: &App, event_name: &str) {
    track_event_handle_with_props(app.handle(), event_name, None);
}

pub fn track_event_handle(app_handle: &AppHandle, event_name: &str) {
    track_event_handle_with_props(app_handle, event_name, None);
}

pub fn track_event_handle_with_props(app_handle: &AppHandle, event_name: &str, props: Option<serde_json::Value>) {
    let Some(client) = CLIENT.get() else {
        tracing::debug!("analytics event '{}' dropped: no Aptabase key in this build", event_name);
        return;
    };
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
    // The session needs a stable id; an install whose store cannot hold one gets one per run.
    let id = install_id(app_handle).unwrap_or_else(|| {
        static RUN_ID: OnceLock<String> = OnceLock::new();
        RUN_ID.get_or_init(|| uuid::Uuid::new_v4().to_string()).clone()
    });
    merged.entry("install_id").or_insert_with(|| id.clone().into());
    tracing::trace!("analytics event '{}' queued", event_name);
    client.enqueue(client.event(event_name, serde_json::Value::Object(merged), &id));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shorter_than_limit_is_untouched() {
        let message = "failed to spawn server";
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
