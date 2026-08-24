//! One handoff connection, from `accept` to close: authenticate the phone,
//! dispatch its op, and carry the bytes in both directions.
//!
//! The endpoint that accepts these connections lives in the parent module, and
//! the transcribe op itself in [`super::transcribe`]; this module is the wire.

use std::path::PathBuf;
use std::sync::Arc;

use eyre::{bail, Context, Result};
use iroh::endpoint::Connection;
use iroh::protocol::{AcceptError, ProtocolHandler};
use subtle::ConstantTimeEq;
use tauri::{Emitter, Manager};
use tokio::io::AsyncWriteExt;

use super::protocol::{self, HandoffActivity, HandoffEvent, HandoffHeader, MAX_AUDIO_BYTES, MAX_HEADER_LEN};
use super::transcribe::model_settings;
use crate::error::LogError;

/// The `ProtocolHandler` the parent module registers on the iroh router: one
/// instance serves every incoming phone connection.
#[derive(Debug, Clone)]
pub(super) struct HandoffHandler {
    pub(super) app_handle: tauri::AppHandle,
    pub(super) token: Arc<String>,
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
pub(super) struct TransferError {
    pub(super) code: String,
    pub(super) message: String,
}

impl TransferError {
    pub(super) fn new(code: &str, message: impl Into<String>) -> Self {
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

/// Sona failures reach us as send or decode errors even when the real cause is
/// the sidecar dying, so ask the child before reporting the surface error.
pub(super) async fn sona_transfer_error(
    sona_state: &tokio::sync::Mutex<crate::setup::SonaState>,
    error: eyre::Error,
) -> TransferError {
    if let Some(api_error) = error.downcast_ref::<crate::sona::SonaApiError>() {
        return TransferError::new(&api_error.code, api_error.message.clone());
    }
    match crate::sona::death_report(sona_state, crate::cmd::transcribe::SONA_DIED).await {
        Some(message) => TransferError::new("internal_error", message),
        None => TransferError::from(error),
    }
}

impl HandoffHandler {
    pub(super) fn emit_activity(&self, state: &'static str, message: Option<String>) {
        self.app_handle
            .emit_to("main", "handoff_activity", HandoffActivity::new(state, message))
            .log_error();
    }

    pub(super) fn emit_done(&self, completion: protocol::HandoffCompletion) {
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
}

pub(super) async fn write_event(send: &mut iroh::endpoint::SendStream, event: &HandoffEvent) -> Result<(), TransferError> {
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
pub(super) async fn receive_audio(
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
}
