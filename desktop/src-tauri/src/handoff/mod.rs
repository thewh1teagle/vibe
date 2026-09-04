//! Phone handoff: a phone records audio, sends it over iroh, this desktop
//! transcribes it with Server and streams the transcript back.
//!
//! The endpoint is *not* spawned at startup — the user opts in from the UI,
//! which calls the `handoff_start` command.

pub mod protocol;
mod transcribe;
mod transfer;

use std::path::PathBuf;
use std::sync::Arc;

use eyre::{Context, Result};
use iroh::endpoint::presets;
use iroh::protocol::Router;
use iroh::{Endpoint, SecretKey};
use tauri::{Emitter, Manager};

use crate::error::LogError;
use protocol::{HandoffActivity, ALPN};
use transfer::HandoffHandler;

/// Whether the user turned handoff on. Namespaced like the other feature keys in
/// `lib/config-keys.ts` (`model.path`, `transcription.saveTranscripts`).
pub const CONFIG_KEY_HANDOFF_ENABLED: &str = "handoff.enabled";

/// Where the phone PWA is deployed: it ships inside the website's GitHub Pages
/// artifact. This is a public URL, not a secret, so it lives in committed source
/// rather than `.env` (which is gitignored and holds signing credentials).
///
/// Resolution order, widest to narrowest:
///   1. `VIBE_PWA_ORIGIN` in the environment at run time — for `just dev` and for
///      pointing a real phone at a tunnel.
///   2. `VIBE_PWA_ORIGIN` at compile time — lets a release build bake a different
///      origin, the same way `APTABASE_APP_KEY` is baked in `analytics.rs`.
///   3. This constant.
pub const DEFAULT_PWA_ORIGIN: &str = match option_env!("VIBE_PWA_ORIGIN") {
    Some(value) => value,
    None => "https://thewh1teagle.github.io/vibe/phone",
};

/// A running handoff endpoint. Dropping this aborts the accept loop; prefer
/// [`HandoffState::shutdown`] for a clean close.
pub struct HandoffState {
    router: Router,
    endpoint_id: String,
    token: String,
}

impl HandoffState {
    /// 64 lowercase hex chars identifying this desktop on the iroh network.
    pub fn endpoint_id(&self) -> String {
        self.endpoint_id.clone()
    }

    /// The 32-hex-char pairing secret the phone must present.
    #[allow(dead_code)]
    pub fn token(&self) -> String {
        self.token.clone()
    }

    /// The exact URL encoded into the pairing QR code.
    pub fn pairing_url(&self, pwa_origin: &str) -> String {
        format_pairing_url(pwa_origin, &self.endpoint_id, &self.token)
    }

    pub async fn shutdown(self) {
        if let Err(error) = self.router.shutdown().await {
            tracing::warn!("handoff router shutdown failed: {:?}", error);
        } else {
            tracing::debug!("handoff router shut down");
        }
    }
}

/// `<pwa_origin>/#<endpoint_id>:<token>` — the exact string the QR encodes.
fn format_pairing_url(pwa_origin: &str, endpoint_id: &str, token: &str) -> String {
    format!("{}/#{}:{}", pwa_origin.trim_end_matches('/'), endpoint_id, token)
}

/// The origin the pairing QR should point at.
pub fn pwa_origin() -> String {
    std::env::var("VIBE_PWA_ORIGIN")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_PWA_ORIGIN.to_string())
}

fn handoff_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .context("failed to resolve app data dir")?
        .join("handoff");
    std::fs::create_dir_all(&dir).with_context(|| format!("failed to create {}", dir.display()))?;
    Ok(dir)
}

#[cfg(unix)]
fn restrict_permissions(path: &std::path::Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .with_context(|| format!("failed to chmod {}", path.display()))
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &std::path::Path) -> Result<()> {
    Ok(())
}

/// Load the persisted iroh identity, generating it on first use so pairing QR
/// codes keep working across restarts.
fn load_or_create_secret_key(app_handle: &tauri::AppHandle) -> Result<SecretKey> {
    let path = handoff_dir(app_handle)?.join("endpoint.key");
    if path.exists() {
        let bytes = std::fs::read(&path).with_context(|| format!("failed to read {}", path.display()))?;
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(SecretKey::from_bytes(&key));
        }
        tracing::warn!("handoff secret key at {} is malformed, regenerating", path.display());
    }
    let secret_key = SecretKey::generate();
    std::fs::write(&path, secret_key.to_bytes()).with_context(|| format!("failed to write {}", path.display()))?;
    restrict_permissions(&path).log_error();
    Ok(secret_key)
}

fn generate_token() -> String {
    let bytes: [u8; 16] = rand::random();
    hex::encode(bytes)
}

/// Load the persisted pairing token, generating it on first use.
fn load_or_create_token(app_handle: &tauri::AppHandle) -> Result<String> {
    let path = handoff_dir(app_handle)?.join("token");
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let existing = existing.trim().to_string();
        if existing.len() == 32 && existing.chars().all(|c| c.is_ascii_hexdigit()) {
            return Ok(existing);
        }
        tracing::warn!("handoff token at {} is malformed, regenerating", path.display());
    }
    let token = generate_token();
    std::fs::write(&path, &token).with_context(|| format!("failed to write {}", path.display()))?;
    restrict_permissions(&path).log_error();
    Ok(token)
}

/// Replace the pairing token, invalidating any QR code handed out earlier.
pub fn regenerate_token(app_handle: &tauri::AppHandle) -> Result<String> {
    let path = handoff_dir(app_handle)?.join("token");
    let token = generate_token();
    std::fs::write(&path, &token).with_context(|| format!("failed to write {}", path.display()))?;
    restrict_permissions(&path).log_error();
    Ok(token)
}

/// Remember whether the user wants handoff on, so enabling it survives a restart.
///
/// Enablement has to persist alongside the identity: the secret key and token are
/// already on disk, so the pairing QR stays valid across restarts. If the endpoint
/// did not come back with it, the phone would keep believing it is paired and dial
/// an endpoint that no longer exists.
pub fn set_enabled(app_handle: &tauri::AppHandle, enabled: bool) {
    use tauri_plugin_store::StoreExt;

    match app_handle.store(crate::config::STORE_FILENAME) {
        Ok(store) => store.set(CONFIG_KEY_HANDOFF_ENABLED, serde_json::Value::Bool(enabled)),
        Err(error) => tracing::warn!("handoff could not persist the enabled flag: {:?}", error),
    }
}

/// Whether handoff was on when the app last closed. Defaults to off: this opens a
/// network listener, so only a user who explicitly turned it on gets it back.
pub fn is_enabled(app_handle: &tauri::AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;

    app_handle
        .store(crate::config::STORE_FILENAME)
        .ok()
        .and_then(|store| store.get(CONFIG_KEY_HANDOFF_ENABLED))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

/// Bind the iroh endpoint and start accepting handoff connections.
pub async fn spawn(app_handle: tauri::AppHandle) -> Result<HandoffState> {
    let secret_key = load_or_create_secret_key(&app_handle)?;
    let token = load_or_create_token(&app_handle)?;

    let endpoint = Endpoint::builder(presets::N0)
        .secret_key(secret_key)
        .alpns(vec![ALPN.to_vec()])
        .bind()
        .await
        .map_err(|error| eyre::eyre!("failed to bind handoff endpoint: {error}"))?;

    let endpoint_id = endpoint.id().to_string();
    tracing::info!("handoff endpoint bound: {}", endpoint_id);

    let handler = HandoffHandler {
        app_handle,
        token: Arc::new(token.clone()),
    };
    let router = Router::builder(endpoint).accept(ALPN, handler).spawn();

    Ok(HandoffState {
        router,
        endpoint_id,
        token,
    })
}

/// Bring handoff back if the user had it on, without making the app wait.
///
/// Binding an iroh endpoint reaches the network, so this returns immediately and
/// finishes in the background; `handoff_status` reports the real state once it
/// settles. A brand-new user gets nothing: the flag defaults to off, and silently
/// opening a network listener on upgrade would be wrong.
pub fn restore_on_startup(app_handle: &tauri::AppHandle) {
    if !is_enabled(app_handle) {
        tracing::debug!("handoff is disabled; not restoring");
        return;
    }

    let app_handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        tracing::info!("restoring handoff endpoint in the background");
        match spawn(app_handle.clone()).await {
            Ok(state) => {
                let runtime = app_handle.state::<tokio::sync::Mutex<Option<HandoffState>>>();
                let mut guard = runtime.lock().await;
                if guard.is_some() {
                    // The user toggled it on while we were still binding; keep
                    // theirs rather than leaking a second router.
                    tracing::debug!("handoff was started manually during restore; dropping the restored one");
                    drop(guard);
                    state.shutdown().await;
                } else {
                    tracing::info!("handoff restored: {}", state.endpoint_id());
                    *guard = Some(state);
                    drop(guard);
                    app_handle
                        .emit_to("main", "handoff_activity", HandoffActivity::new("ready", None))
                        .log_error();
                }
            }
            Err(error) => {
                // Never leave the UI claiming handoff is on when it is not. The
                // saved preference stays true so the next launch retries, but
                // `handoff_status` reports the truth: not running.
                let message = format!("{error:#}");
                tracing::error!("failed to restore handoff endpoint: {}", message);
                app_handle
                    .emit_to("main", "handoff_activity", HandoffActivity::new("error", Some(message)))
                    .log_error();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_url_matches_the_contract_shape() {
        let id = "a".repeat(64);
        let token = "0123456789abcdef0123456789abcdef";
        assert_eq!(
            format_pairing_url("http://localhost:8088", &id, token),
            format!("http://localhost:8088/#{id}:{token}")
        );
        // A trailing slash on the origin must not produce a double slash.
        assert_eq!(
            format_pairing_url("https://vibe.example/", &id, token),
            format_pairing_url("https://vibe.example", &id, token)
        );
    }
}
