//! A minimal Aptabase client: queue events, send them in batches to the ingest API.
//!
//! Replaces `tauri-plugin-aptabase`. The wire format is the plugin's, field for field, so
//! the dashboards and exports keep their columns; the session id is per install per day.

use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// The server accepts at most this many events per request.
const BATCH_SIZE: usize = 25;
/// Offline for long enough, the oldest events are dropped rather than growing without bound.
const MAX_QUEUED: usize = 1000;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
#[cfg(debug_assertions)]
pub const FLUSH_INTERVAL: Duration = Duration::from_secs(2);
#[cfg(not(debug_assertions))]
pub const FLUSH_INTERVAL: Duration = Duration::from_secs(60);

#[cfg(target_os = "linux")]
const ENGINE_NAME: &str = "WebKitGTK";
#[cfg(target_os = "macos")]
const ENGINE_NAME: &str = "WebKit";
#[cfg(target_os = "windows")]
const ENGINE_NAME: &str = "WebView2";

/// Where a key's events go: `A-US-…` and `A-EU-…` are Aptabase cloud, `A-SH-…` is self-hosted
/// at `host`. Anything else disables tracking.
pub fn ingest_url(app_key: &str, host: &str) -> Option<String> {
    let base = match app_key.split('-').collect::<Vec<_>>()[..] {
        ["A", "US", _] => "https://us.aptabase.com",
        ["A", "EU", _] => "https://eu.aptabase.com",
        ["A", "SH", _] if !host.is_empty() => host.trim_end_matches('/'),
        _ => return None,
    };
    Some(format!("{base}/api/v0/events"))
}

/// Same install, same UTC day, same session. Derived from the anonymous install id rather
/// than a hardware id, and cut to 36 characters, the server's limit.
pub fn session_id(install_id: &str, app_key: &str, date: &str) -> String {
    let digest = Sha256::digest(format!("{install_id}{app_key}{date}"));
    format!("{digest:x}")[..36].to_string()
}

struct SystemProps {
    os_name: String,
    os_version: String,
    locale: String,
    engine_version: String,
}

impl SystemProps {
    fn detect() -> Self {
        let info = os_info::get();
        let os_name = match info.os_type() {
            os_info::Type::Macos => "macOS".to_string(),
            os_info::Type::Windows => "Windows".to_string(),
            #[cfg(target_os = "linux")]
            _ if std::env::var("FLATPAK_ID").is_ok() => "Flatpak".to_string(),
            other => other.to_string(),
        };
        Self {
            os_name,
            os_version: info.version().to_string(),
            locale: sys_locale::get_locale().unwrap_or_default(),
            engine_version: tauri::webview_version().unwrap_or_default(),
        }
    }
}

pub struct Client {
    url: String,
    app_key: String,
    app_version: String,
    system: SystemProps,
    http: reqwest::Client,
    queue: Mutex<Vec<Value>>,
}

impl Client {
    pub fn new(app_key: &str, url: String, app_version: String) -> Self {
        let system = SystemProps::detect();
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .user_agent(format!(
                "{}/{} {}/{} {}",
                system.os_name, system.os_version, ENGINE_NAME, system.engine_version, system.locale
            ))
            .build()
            .unwrap_or_default();
        Self {
            url,
            app_key: app_key.to_string(),
            app_version,
            system,
            http,
            queue: Mutex::new(Vec::new()),
        }
    }

    pub fn event(&self, name: &str, props: Value, install_id: &str) -> Value {
        let now = chrono::Utc::now();
        json!({
            "timestamp": now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "sessionId": session_id(install_id, &self.app_key, &now.format("%Y-%m-%d").to_string()),
            "eventName": name,
            "systemProps": {
                "isDebug": cfg!(debug_assertions),
                "osName": self.system.os_name,
                "osVersion": self.system.os_version,
                "locale": self.system.locale,
                "engineName": ENGINE_NAME,
                "engineVersion": self.system.engine_version,
                "appVersion": self.app_version,
                "sdkVersion": concat!("vibe@", env!("CARGO_PKG_VERSION")),
            },
            "props": props,
        })
    }

    pub fn enqueue(&self, event: Value) {
        let Ok(mut queue) = self.queue.lock() else { return };
        queue.push(event);
        let overflow = queue.len().saturating_sub(MAX_QUEUED);
        queue.drain(..overflow);
    }

    /// Sends everything queued. A batch the server rejects outright is dropped, since sending it
    /// again would fail the same way; one lost to the network or a server error is kept.
    pub async fn flush(&self) {
        let pending = match self.queue.lock() {
            Ok(mut queue) => std::mem::take(&mut *queue),
            Err(_) => return,
        };
        let mut retry = Vec::new();
        for batch in pending.chunks(BATCH_SIZE) {
            let sent = self
                .http
                .post(&self.url)
                .header("App-Key", &self.app_key)
                .json(batch)
                .send()
                .await;
            match sent {
                Ok(response) if response.status().is_success() => {}
                Ok(response) if response.status().is_client_error() => {
                    tracing::debug!("analytics batch rejected: {}", response.status());
                }
                Ok(response) => {
                    tracing::debug!("analytics batch failed: {}", response.status());
                    retry.extend_from_slice(batch);
                }
                Err(error) => {
                    tracing::debug!("analytics batch not sent: {error}");
                    retry.extend_from_slice(batch);
                }
            }
        }
        if !retry.is_empty() {
            if let Ok(mut queue) = self.queue.lock() {
                retry.append(&mut queue);
                *queue = retry;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_route_to_their_region() {
        assert_eq!(ingest_url("A-US-123", "").unwrap(), "https://us.aptabase.com/api/v0/events");
        assert_eq!(ingest_url("A-EU-123", "").unwrap(), "https://eu.aptabase.com/api/v0/events");
        assert_eq!(
            ingest_url("A-SH-123", "https://stats.example.com/").unwrap(),
            "https://stats.example.com/api/v0/events"
        );
        assert!(ingest_url("A-SH-123", "").is_none());
        assert!(ingest_url("not-a-key", "https://x").is_none());
        assert!(ingest_url("", "https://x").is_none());
    }

    #[test]
    fn session_is_stable_per_install_and_day() {
        let id = session_id("install", "A-SH-1", "2026-10-29");
        assert_eq!(id.len(), 36);
        assert_eq!(id, session_id("install", "A-SH-1", "2026-10-29"));
        assert_ne!(id, session_id("install", "A-SH-1", "2026-10-30"));
        assert_ne!(id, session_id("other", "A-SH-1", "2026-10-29"));
    }

    #[test]
    fn event_has_the_fields_the_dashboards_read() {
        let client = Client::new("A-SH-1", "https://x/api/v0/events".into(), "3.3.0".into());
        let event = client.event("app_started", json!({ "install_id": "i" }), "i");
        for field in ["timestamp", "sessionId", "eventName", "systemProps", "props"] {
            assert!(event.get(field).is_some(), "missing {field}");
        }
        let system = &event["systemProps"];
        for field in [
            "isDebug",
            "osName",
            "osVersion",
            "locale",
            "engineName",
            "engineVersion",
            "appVersion",
            "sdkVersion",
        ] {
            assert!(system.get(field).is_some(), "missing systemProps.{field}");
        }
        assert_eq!(system["appVersion"], "3.3.0");
        assert_eq!(event["props"]["install_id"], "i");
    }

    #[test]
    fn queue_is_capped() {
        let client = Client::new("A-SH-1", "https://x".into(), "1".into());
        for i in 0..MAX_QUEUED + 10 {
            client.enqueue(json!(i));
        }
        let queue = client.queue.lock().unwrap();
        assert_eq!(queue.len(), MAX_QUEUED);
        assert_eq!(queue[0], json!(10));
    }
}
