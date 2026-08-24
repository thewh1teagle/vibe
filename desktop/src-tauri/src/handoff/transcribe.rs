//! The transcribe op: receive the phone's audio, load the user's model, run it
//! through Sona and stream the transcript back — plus the one analytics event
//! every attempt reports.
//!
//! Split out of [`super::transfer`], which owns the connection itself: the
//! token check, op dispatch, and the wire helpers this module writes through.

use futures_util::StreamExt;
use tauri::Manager;

use super::protocol::{self, HandoffEvent, HandoffHeader};
use super::transfer::{receive_audio, sona_transfer_error, write_event, HandoffHandler, TransferError};
use crate::sona::SonaEvent;

/// Keys in `app_config.json` holding the user's model settings (`lib/config-keys.ts`).
const CONFIG_KEY_MODEL_PATH: &str = "model.path";
const CONFIG_KEY_GPU_DEVICE: &str = "model.gpuDevice";
const CONFIG_KEY_UNLOAD_TIMEOUT_MINUTES: &str = "model.unloadTimeoutMinutes";

/// Display name for a phone transcription in Recents.
const PHONE_TRANSCRIPT_NAME: &str = "Phone recording";

/// Matches the frontend default in `providers/preference.tsx`.
const DEFAULT_UNLOAD_TIMEOUT_MINUTES: u32 = 5;

impl HandoffHandler {
    /// The transcribe op. Wraps [`HandoffHandler::run_transcribe`] so that every
    /// outcome — including a transfer that dies partway — reports exactly one
    /// `handoff_transcribe` event. Without this the dataset would only ever see
    /// successes and the feature would look healthier than it is.
    pub(super) async fn handle_transcribe(
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
        let stream = match crate::sona::SonaProcess::transcribe_stream(&client, &base_url, &options).await {
            Ok(stream) => stream,
            Err(error) => return Err(sona_transfer_error(&sona_state, error).await),
        };
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
                    return Err(sona_transfer_error(&sona_state, error).await);
                }
            }
        }

        let text = match full_text {
            Some(text) => text,
            None => {
                // Same as the desktop path: a stream that stops early is usually
                // the sidecar dying, so report how it died when it did.
                let message = crate::sona::death_report(&sona_state, crate::cmd::transcribe::SONA_DIED)
                    .await
                    .unwrap_or_else(|| "Sona transcription stream ended before completion".to_string());
                return Err(TransferError::new("internal_error", message));
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
pub(super) struct ModelSettings {
    pub(super) path: String,
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
pub(super) fn model_settings(app_handle: &tauri::AppHandle) -> Option<ModelSettings> {
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

#[cfg(test)]
mod tests {
    use super::super::protocol::MAX_AUDIO_BYTES;
    use super::*;

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
}
