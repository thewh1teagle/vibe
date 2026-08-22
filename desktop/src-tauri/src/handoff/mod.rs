//! Phone handoff: a phone records audio, sends it over iroh, this desktop
//! transcribes it with Sona and streams the transcript back.
//!
//! The endpoint is *not* spawned at startup — the user opts in from the UI,
//! which calls the `handoff_start` command.

pub mod protocol;

use std::path::PathBuf;
use std::sync::Arc;

use eyre::{bail, Context, Result};
use futures_util::StreamExt;
use iroh::endpoint::{presets, Connection};
use iroh::protocol::{AcceptError, ProtocolHandler, Router};
use iroh::{Endpoint, SecretKey};
use subtle::ConstantTimeEq;
use tauri::{Emitter, Manager};
use tokio::io::AsyncWriteExt;

use crate::error::LogError;
use crate::sona::SonaEvent;
use protocol::{HandoffActivity, HandoffEvent, HandoffHeader, ALPN, MAX_AUDIO_BYTES, MAX_HEADER_LEN};

/// Keys in `app_config.json` holding the user's model settings (`lib/config-keys.ts`).
const CONFIG_KEY_MODEL_PATH: &str = "model.path";
const CONFIG_KEY_GPU_DEVICE: &str = "model.gpuDevice";
const CONFIG_KEY_UNLOAD_TIMEOUT_MINUTES: &str = "model.unloadTimeoutMinutes";

/// Whether the user turned handoff on. Namespaced like the other feature keys in
/// `lib/config-keys.ts` (`model.path`, `transcription.saveTranscripts`).
pub const CONFIG_KEY_HANDOFF_ENABLED: &str = "handoff.enabled";

/// Display name for a phone transcription in Recents.
const PHONE_TRANSCRIPT_NAME: &str = "Phone recording";

/// Matches the frontend default in `providers/preference.tsx`.
const DEFAULT_UNLOAD_TIMEOUT_MINUTES: u32 = 5;

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

#[derive(Debug, Clone)]
struct HandoffHandler {
    app_handle: tauri::AppHandle,
    token: Arc<String>,
}

impl ProtocolHandler for HandoffHandler {
    async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
        let (mut send, mut recv) = connection.accept_bi().await?;

        // Every failure path still owes the phone a terminal `error` line; only a
        // broken stream (which we cannot report on anyway) escapes as an error.
        let outcome = self.handle_transfer(&mut send, &mut recv).await;
        if let Err(failure) = outcome {
            tracing::error!("handoff transfer failed: [{}] {}", failure.code, failure.message);
            self.emit_activity("error", Some(failure.message.clone()));
            let line = HandoffEvent::Error {
                code: failure.code,
                message: failure.message,
            }
            .to_line();
            let _ = send.write_all(line.as_bytes()).await;
        }

        let _ = send.finish();
        connection.closed().await;
        Ok(())
    }
}

/// A failure that must be reported to the phone as a terminal `error` line.
struct TransferError {
    code: String,
    message: String,
}

impl TransferError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

impl From<eyre::Error> for TransferError {
    fn from(error: eyre::Error) -> Self {
        Self::new("internal_error", error.to_string())
    }
}

impl HandoffHandler {
    fn emit_activity(&self, state: &'static str, message: Option<String>) {
        self.app_handle
            .emit_to("main", "handoff_activity", HandoffActivity::new(state, message))
            .log_error();
    }

    fn emit_done(&self, completion: protocol::HandoffCompletion) {
        self.app_handle
            .emit_to("main", "handoff_activity", HandoffActivity::done(completion))
            .log_error();
    }

    async fn handle_transfer(
        &self,
        send: &mut iroh::endpoint::SendStream,
        recv: &mut iroh::endpoint::RecvStream,
    ) -> Result<(), TransferError> {
        let header = read_header(recv).await?;

        // Constant-time comparison so a wrong token leaks nothing about the right one.
        let expected = self.token.as_bytes();
        let provided = header.token.as_bytes();
        let authorized = expected.len() == provided.len() && bool::from(expected.ct_eq(provided));
        if !authorized {
            tracing::warn!("handoff connection rejected: invalid pairing token");
            return Err(TransferError::new("unauthorized", "Invalid pairing token"));
        }

        // Dispatch happens only after the token check, and each branch is a
        // separate function, so a capabilities request can never fall through into
        // the audio-reading loop and block on bytes that will never arrive.
        match header.op.as_deref() {
            None | Some(protocol::OP_TRANSCRIBE) => self.handle_transcribe(send, recv, header).await,
            Some(protocol::OP_CAPABILITIES) => {
                let event = self.capabilities().await;
                // Counts PWA page loads rather than people — see the note on
                // `HANDOFF_CAPABILITIES`. `model_loaded` is the useful part: it
                // shows how often someone opens the phone app with nothing ready.
                let model_loaded = matches!(event, HandoffEvent::Capabilities { model_loaded: true, .. });
                crate::analytics::track_event_handle_with_props(
                    &self.app_handle,
                    crate::analytics::events::HANDOFF_CAPABILITIES,
                    Some(serde_json::json!({ "model_loaded": model_loaded })),
                );
                // Exactly one line, then the caller finishes the stream.
                write_event(send, &event).await
            }
            Some(other) => Err(TransferError::new("invalid_request", format!("Unknown op '{other}'"))),
        }
    }

    /// Report what the currently loaded model can do. Never fails for the
    /// ordinary "nothing loaded yet" case — that is a normal state the phone
    /// renders, not an error.
    async fn capabilities(&self) -> HandoffEvent {
        match self.read_capabilities().await {
            Ok(event) => event,
            Err(error) => {
                // Degrade honestly: if we cannot confirm what is loaded, we say
                // nothing is, rather than advertising languages we may not have.
                tracing::warn!("handoff could not read model capabilities: {:?}", error);
                HandoffEvent::no_capabilities()
            }
        }
    }

    async fn read_capabilities(&self) -> Result<HandoffEvent> {
        let sona_state = self.app_handle.state::<tokio::sync::Mutex<crate::setup::SonaState>>();
        let endpoint = {
            let state = sona_state.lock().await;
            state.process.as_ref().map(|process| (process.client(), process.base_url()))
        }; // lock released here, before any I/O
        let Some((client, base_url)) = endpoint else {
            tracing::debug!("handoff capabilities: sona is not running");
            return Ok(HandoffEvent::no_capabilities());
        };

        // The same selection the transcribe path will load on demand, so a
        // `modelLoaded: true` here is a promise the transcribe path can keep.
        let Some(model_path) = model_settings(&self.app_handle).map(|settings| settings.path) else {
            tracing::debug!("handoff capabilities: no model selected in {}", crate::config::STORE_FILENAME);
            return Ok(HandoffEvent::no_capabilities());
        };
        if !std::path::Path::new(&model_path).is_file() {
            tracing::warn!("handoff capabilities: selected model {} does not exist", model_path);
            return Ok(HandoffEvent::no_capabilities());
        }

        let metadata = crate::sona::SonaProcess::model_metadata_with(&client, &base_url, &model_path).await?;
        let model_name = std::path::Path::new(&model_path)
            .file_name()
            .map(|name| name.to_string_lossy().to_string());

        Ok(HandoffEvent::Capabilities {
            model_loaded: true,
            model_name,
            languages: metadata.capabilities.languages,
            language_detection: metadata.capabilities.language_detection,
            translation: metadata.capabilities.translation,
            max_audio_bytes: MAX_AUDIO_BYTES,
        })
    }

    /// The transcribe op. Wraps [`HandoffHandler::run_transcribe`] so that every
    /// outcome — including a transfer that dies partway — reports exactly one
    /// `handoff_transcribe` event. Without this the dataset would only ever see
    /// successes and the feature would look healthier than it is.
    async fn handle_transcribe(
        &self,
        send: &mut iroh::endpoint::SendStream,
        recv: &mut iroh::endpoint::RecvStream,
        header: HandoffHeader,
    ) -> Result<(), TransferError> {
        let started = std::time::Instant::now();
        let mut stats = TransferStats::default();
        let result = self.run_transcribe(send, recv, &header, &mut stats).await;
        self.track_transcribe(&header, &stats, started.elapsed(), &result);
        result
    }

    /// One `handoff_transcribe` per transfer. Technical facts only: no transcript,
    /// no filename, no saved path, no model path, and the chosen language is
    /// reduced to whether one was chosen at all.
    fn track_transcribe(
        &self,
        header: &HandoffHeader,
        stats: &TransferStats,
        elapsed: std::time::Duration,
        result: &Result<(), TransferError>,
    ) {
        let mut props = serde_json::json!({
            "success": result.is_ok(),
            "audio_size_bucket": size_bucket(stats.audio_bytes),
            // Whole operation: receive + model load + transcription.
            "duration_sec": elapsed.as_secs(),
            // Whether a language was picked, never which one.
            "auto_detect": header.lang.is_none(),
            "translate": header.translate.unwrap_or(false),
        });
        if let Some(seconds) = stats.transcribe_sec {
            props["transcribe_duration_sec"] = seconds.into();
        }
        if let Some(ref model_name) = stats.model_name {
            props["model_name"] = model_name.as_str().into();
        }
        if let Err(ref failure) = *result {
            props["error_code"] = failure.code.as_str().into();
        }
        crate::analytics::track_event_handle_with_props(
            &self.app_handle,
            crate::analytics::events::HANDOFF_TRANSCRIBE,
            Some(props),
        );
    }

    async fn run_transcribe(
        &self,
        send: &mut iroh::endpoint::SendStream,
        recv: &mut iroh::endpoint::RecvStream,
        header: &HandoffHeader,
        stats: &mut TransferStats,
    ) -> Result<(), TransferError> {
        write_event(send, &HandoffEvent::Accepted).await?;
        self.emit_activity("receiving", None);

        // The recording exists nowhere but the phone until this point, so it is
        // kept like any other Vibe recording rather than deleted after use.
        let (audio_path, audio_bytes) = receive_audio(&self.app_handle, recv, header.filename.as_deref()).await?;
        stats.audio_bytes = Some(audio_bytes);
        let saved_path = audio_path.to_string_lossy().to_string();
        tracing::info!("handoff saved phone recording to {}", saved_path);

        // A failed transcription leaves the file in place on purpose: the audio is
        // complete and is the only copy, so the user can retry from the desktop.
        // Only a truncated or rejected transfer is deleted, inside `receive_audio`.
        self.transcribe(send, &audio_path, header, saved_path.clone(), stats).await?;

        // The frontend decides whether to keep it — it owns the
        // `transcription.saveTranscripts` preference.
        if let Some(completion) = stats.completion.take() {
            self.emit_done(completion);
        }
        Ok(())
    }

    /// Mirrors `cmd::transcribe::transcribe`, but forwards each Sona event to the
    /// phone instead of the webview.
    async fn transcribe(
        &self,
        send: &mut iroh::endpoint::SendStream,
        audio_path: &std::path::Path,
        header: &HandoffHeader,
        saved_path: String,
        stats: &mut TransferStats,
    ) -> Result<(), TransferError> {
        // The desktop UI calls `load_model` before every transcription; the phone
        // has no way to do that, so the handoff path does it here. Without this,
        // capabilities would promise a model that Sona was never told to load.
        let Some(settings) = model_settings(&self.app_handle) else {
            return Err(TransferError::new("no_model", "No model is selected in Vibe on the desktop"));
        };

        // Loading a large model takes real time, and the phone would otherwise sit
        // at "transcribing 0%" for all of it. Non-terminal, so a client that does
        // not know the `status` type can ignore it and keep reading.
        write_event(send, &HandoffEvent::status(protocol::PHASE_LOADING_MODEL)).await?;
        self.emit_activity("loading_model", None);
        tracing::debug!("handoff loading model {}", settings.path);
        // File name only, and only if it looks like a distributed model.
        stats.model_name = Some(safe_model_name(&settings.path));
        crate::cmd::sona_cmd::load_model(
            self.app_handle.clone(),
            settings.path.clone(),
            settings.gpu_device,
            settings.unload_timeout_minutes,
        )
        .await
        // Surface why it failed — a missing model file and an unavailable GPU need
        // different fixes, and only the desktop knows which one happened.
        .map_err(|error| TransferError::new("model_load_failed", format!("{error:#}")))?;

        write_event(send, &HandoffEvent::status(protocol::PHASE_TRANSCRIBING)).await?;
        self.emit_activity("transcribing", None);

        let sona_state = self.app_handle.state::<tokio::sync::Mutex<crate::setup::SonaState>>();
        let (client, base_url) = {
            let state = sona_state.lock().await;
            let process = state
                .process
                .as_ref()
                .ok_or_else(|| TransferError::new("no_model", "Please load model first"))?;
            (process.client(), process.base_url())
        }; // lock released here, before any I/O

        let options = crate::cmd::TranscribeOptions {
            path: audio_path.to_string_lossy().to_string(),
            lang: header.lang.clone(),
            verbose: None,
            n_threads: None,
            init_prompt: None,
            temperature: None,
            // Passed straight through; whether it is meaningful is the phone's
            // call, made against the `translation` flag we reported.
            translate: header.translate,
            max_text_ctx: None,
            word_timestamps: None,
            max_sentence_len: None,
            sampling_strategy: None,
            best_of: None,
            beam_size: None,
            diarize_model: None,
            stable_timestamps: None,
            vad_model: None,
        };

        let start = std::time::Instant::now();
        let stream = crate::sona::SonaProcess::transcribe_stream(&client, &base_url, &options)
            .await
            .map_err(|error| {
                if let Some(api_error) = error.downcast_ref::<crate::sona::SonaApiError>() {
                    TransferError::new(&api_error.code, api_error.message.clone())
                } else {
                    TransferError::from(error)
                }
            })?;
        tokio::pin!(stream);

        let mut full_text: Option<String> = None;
        // Kept so the frontend can write the same transcript record a local
        // transcription produces; the phone gets each segment streamed as it lands.
        let mut segments: Vec<crate::transcript::Segment> = Vec::new();

        while let Some(event_result) = stream.next().await {
            match event_result {
                Ok(SonaEvent::Progress { progress }) => {
                    write_event(send, &HandoffEvent::Progress { progress }).await?;
                }
                Ok(SonaEvent::Segment {
                    start,
                    end,
                    text,
                    speaker,
                }) => {
                    // Sona reports seconds as f64; the wire format wants centiseconds.
                    let segment = crate::transcript::Segment {
                        start: (start * 100.0) as i64,
                        stop: (end * 100.0) as i64,
                        text,
                        speaker,
                    };
                    segments.push(segment.clone());
                    write_event(
                        send,
                        &HandoffEvent::Segment {
                            start: segment.start,
                            stop: segment.stop,
                            text: segment.text,
                            speaker: segment.speaker,
                        },
                    )
                    .await?;
                }
                Ok(SonaEvent::Result { text }) => {
                    full_text = Some(text);
                }
                Ok(SonaEvent::Error { code, message }) => {
                    return Err(TransferError::new(code.as_deref().unwrap_or("internal_error"), message));
                }
                Err(error) => {
                    tracing::error!("handoff sona stream error: {:?}", error);
                    return Err(TransferError::from(error));
                }
            }
        }

        let text = match full_text {
            Some(text) => text,
            None => {
                return Err(TransferError::new(
                    "internal_error",
                    "Sona transcription stream ended before completion",
                ))
            }
        };
        let processing_time_sec = start.elapsed().as_secs();
        stats.transcribe_sec = Some(processing_time_sec);
        stats.completion = Some(protocol::HandoffCompletion {
            // The store appends its own `-<yyyyMMdd-HHmmss>` stamp, so a bare
            // label reads better in Recents than a second embedded timestamp.
            name: PHONE_TRANSCRIPT_NAME.to_string(),
            saved_path: saved_path.clone(),
            segments,
            language: header.lang.clone(),
            model_path: Some(settings.path.clone()),
        });

        write_event(
            send,
            &HandoffEvent::Done {
                text,
                processing_time_sec,
                saved_path: Some(saved_path),
            },
        )
        .await?;
        Ok(())
    }
}

/// What one transfer is worth reporting, gathered as it happens so the event
/// fires even when the transfer fails partway.
#[derive(Debug, Default)]
struct TransferStats {
    audio_bytes: Option<u64>,
    transcribe_sec: Option<u64>,
    model_name: Option<String>,
    /// The record the frontend needs to put this transcription into Recents.
    completion: Option<protocol::HandoffCompletion>,
}

/// Bucket the audio size. An exact byte count is closer to a fingerprint than we
/// need; buckets answer "are people sending long recordings?" just as well.
fn size_bucket(bytes: Option<u64>) -> &'static str {
    const MB: u64 = 1024 * 1024;
    match bytes {
        None => "unknown",
        Some(bytes) if bytes < MB => "<1MB",
        Some(bytes) if bytes < 10 * MB => "1-10MB",
        Some(bytes) if bytes < 50 * MB => "10-50MB",
        Some(_) => ">50MB",
    }
}

/// The model's file name, never its path — a path would carry the user's home
/// directory. Anything that is not shaped like a distributed model file is
/// reported as `custom`, so a model someone renamed to something personal never
/// leaves the machine.
fn safe_model_name(model_path: &str) -> String {
    let name = std::path::Path::new(model_path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    let plausible = !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if plausible {
        name
    } else {
        "custom".to_string()
    }
}

/// The model settings the desktop UI persists, as `load_model` wants them.
#[derive(Debug, Clone)]
struct ModelSettings {
    path: String,
    gpu_device: Option<i32>,
    unload_timeout_minutes: u32,
}

/// Read the user's model selection out of `app_config.json`.
///
/// `SonaState` does not remember which model was last handed to `load_model` and
/// Sona exposes no "what is loaded" endpoint, so the persisted selection is the
/// source of truth — the same one the desktop UI passes to `load_model` before
/// every transcription. Reading all three keys here keeps the handoff path
/// honouring the user's GPU and unload-timeout choices too.
fn model_settings(app_handle: &tauri::AppHandle) -> Option<ModelSettings> {
    use tauri_plugin_store::StoreExt;

    let store = app_handle
        .store(crate::config::STORE_FILENAME)
        .map_err(|error| tracing::warn!("handoff could not open the config store: {:?}", error))
        .ok()?;

    let path = store.get(CONFIG_KEY_MODEL_PATH)?.as_str()?.trim().to_string();
    if path.is_empty() {
        return None;
    }

    // Defaults match `providers/preference.tsx`: no GPU override, 5 minute unload.
    let gpu_device = store
        .get(CONFIG_KEY_GPU_DEVICE)
        .and_then(|value| value.as_i64())
        .map(|value| value as i32);
    let unload_timeout_minutes = store
        .get(CONFIG_KEY_UNLOAD_TIMEOUT_MINUTES)
        .and_then(|value| value.as_u64())
        .map(|value| value as u32)
        .unwrap_or(DEFAULT_UNLOAD_TIMEOUT_MINUTES);

    Some(ModelSettings {
        path,
        gpu_device,
        unload_timeout_minutes,
    })
}

async fn write_event(send: &mut iroh::endpoint::SendStream, event: &HandoffEvent) -> Result<(), TransferError> {
    send.write_all(event.to_line().as_bytes())
        .await
        .map_err(|error| TransferError::new("internal_error", format!("failed to write to phone: {error}")))
}

async fn read_header(recv: &mut iroh::endpoint::RecvStream) -> Result<HandoffHeader, TransferError> {
    let mut len_bytes = [0u8; 4];
    recv.read_exact(&mut len_bytes)
        .await
        .map_err(|error| TransferError::new("invalid_request", format!("failed to read header length: {error}")))?;
    let header_len = u32::from_be_bytes(len_bytes);
    if header_len == 0 || header_len > MAX_HEADER_LEN {
        return Err(TransferError::new(
            "invalid_request",
            format!("header length {header_len} out of range"),
        ));
    }

    let mut buffer = vec![0u8; header_len as usize];
    recv.read_exact(&mut buffer)
        .await
        .map_err(|error| TransferError::new("invalid_request", format!("failed to read header: {error}")))?;
    serde_json::from_slice::<HandoffHeader>(&buffer)
        .map_err(|error| TransferError::new("invalid_request", format!("malformed header: {error}")))
}

/// Stream the audio body to a temp file, enforcing the size cap as we go so a
/// hostile peer can never fill the disk.
async fn receive_audio(
    app_handle: &tauri::AppHandle,
    recv: &mut iroh::endpoint::RecvStream,
    filename: Option<&str>,
) -> Result<(PathBuf, u64), TransferError> {
    let path = recording_path(app_handle, filename)
        .map_err(|error| TransferError::new("internal_error", format!("failed to pick a save path: {error:#}")))?;
    let mut file = tokio::fs::File::create(&path)
        .await
        .map_err(|error| TransferError::new("internal_error", format!("failed to create recording file: {error}")))?;

    let mut buffer = vec![0u8; 64 * 1024];
    let mut total: u64 = 0;
    loop {
        // iroh's `RecvStream::read` returns `None` once the peer finished the stream.
        let read = match recv
            .read(&mut buffer)
            .await
            .map_err(|error| TransferError::new("invalid_request", format!("failed to read audio: {error}")))?
        {
            Some(read) if read > 0 => read,
            _ => break,
        };
        total += read as u64;
        if total > MAX_AUDIO_BYTES {
            let _ = tokio::fs::remove_file(&path).await;
            return Err(TransferError::new(
                "payload_too_large",
                format!("Audio exceeds the {} MiB limit", MAX_AUDIO_BYTES / (1024 * 1024)),
            ));
        }
        file.write_all(&buffer[..read])
            .await
            .map_err(|error| TransferError::new("internal_error", format!("failed to write recording: {error}")))?;
    }

    file.flush()
        .await
        .map_err(|error| TransferError::new("internal_error", format!("failed to flush recording: {error}")))?;
    drop(file);

    if total == 0 {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(TransferError::new("invalid_request", "No audio received"));
    }
    Ok((path, total))
}

/// The extension to save under, taken from the phone-supplied file name but
/// never the name itself: only a short alphanumeric extension is trusted, so a
/// peer cannot steer the write out of the recordings folder.
fn audio_extension(filename: Option<&str>) -> String {
    filename
        .and_then(|name| std::path::Path::new(name).extension())
        .and_then(|ext| ext.to_str())
        .filter(|ext| !ext.is_empty() && ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("m4a")
        .to_lowercase()
}

/// Where to save an incoming phone recording: `~/Documents/Vibe`, the same
/// folder `cmd::files::get_default_recording_path` hands the frontend.
///
/// The name is timestamped so recordings sort chronologically, and a numeric
/// suffix is added rather than overwriting an existing file.
fn recording_path(app_handle: &tauri::AppHandle, filename: Option<&str>) -> Result<PathBuf> {
    let folder = app_handle
        .path()
        .document_dir()
        .map_err(|error| eyre::eyre!("failed to resolve documents dir: {error:?}"))?
        .join(crate::config::DOCUMENTS_SUBFOLDER);
    std::fs::create_dir_all(&folder).with_context(|| format!("failed to create {}", folder.display()))?;

    let extension = audio_extension(filename);
    let stem = format!("phone-{}", chrono::Local::now().format("%Y-%m-%d-%H-%M-%S"));

    let candidate = folder.join(format!("{stem}.{extension}"));
    if !candidate.exists() {
        return Ok(candidate);
    }
    // Two recordings can land in the same second; never clobber the earlier one.
    for suffix in 1..1000 {
        let candidate = folder.join(format!("{stem}-{suffix}.{extension}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    bail!("could not find a free filename for {}", candidate.display())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_comes_from_the_phone_but_only_when_it_is_safe() {
        assert_eq!(audio_extension(Some("recording.m4a")), "m4a");
        assert_eq!(audio_extension(Some("Recording.WAV")), "wav");
        // No name, no extension, or a hostile one all fall back to the default.
        assert_eq!(audio_extension(None), "m4a");
        assert_eq!(audio_extension(Some("")), "m4a");
        assert_eq!(audio_extension(Some("recording")), "m4a");
        assert_eq!(audio_extension(Some("../../etc/passwd")), "m4a");
        assert_eq!(audio_extension(Some("x.verylongextension")), "m4a");
        assert_eq!(audio_extension(Some("x.m4a/../..")), "m4a");
    }

    #[test]
    fn audio_size_is_bucketed_never_exact() {
        const MB: u64 = 1024 * 1024;
        assert_eq!(size_bucket(None), "unknown");
        assert_eq!(size_bucket(Some(0)), "<1MB");
        assert_eq!(size_bucket(Some(MB - 1)), "<1MB");
        assert_eq!(size_bucket(Some(MB)), "1-10MB");
        assert_eq!(size_bucket(Some(10 * MB - 1)), "1-10MB");
        assert_eq!(size_bucket(Some(10 * MB)), "10-50MB");
        assert_eq!(size_bucket(Some(50 * MB - 1)), "10-50MB");
        assert_eq!(size_bucket(Some(50 * MB)), ">50MB");
        assert_eq!(size_bucket(Some(MAX_AUDIO_BYTES)), ">50MB");
    }

    #[test]
    fn model_name_never_leaks_a_path_or_a_personal_filename() {
        assert_eq!(
            safe_model_name("/Users/alice/models/ggml-large-v3-turbo.bin"),
            "ggml-large-v3-turbo.bin"
        );
        // A Windows path on a unix host is not split into components, so the
        // whole string fails the shape check and degrades to "custom" — the
        // failure direction we want.
        assert!(!safe_model_name("C:\\Users\\alice\\ggml-medium.bin").contains("alice"));
        // Anything not shaped like a distributed model is reported generically.
        assert_eq!(safe_model_name("/models/alice's therapy notes model.bin"), "custom");
        assert_eq!(safe_model_name("/models/модель.bin"), "custom");
        assert_eq!(safe_model_name(&format!("/models/{}.bin", "x".repeat(80))), "custom");
        assert_eq!(safe_model_name(""), "custom");
        // Whatever happens, no directory component survives.
        for path in ["/Users/alice/models/ggml-large-v3-turbo.bin", "/models/alice's model.bin"] {
            assert!(!safe_model_name(path).contains("alice"), "{path} leaked a path component");
            assert!(!safe_model_name(path).contains('/'));
        }
    }

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
