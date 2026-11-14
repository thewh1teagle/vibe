use crate::error::LogError;
use crate::server::ServerEvent;
use crate::setup::ServerState;
use crate::transcript::{Segment, Transcript};
use eyre::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Emitter, EventId, Listener, State};
use tokio::sync::Mutex;

use super::{ui::set_progress_bar, CommandError};

#[allow(dead_code)]
#[derive(Deserialize, Serialize, Clone)]
pub struct FfmpegOptions {
    pub normalize_loudness: bool,
    pub custom_command: Option<String>,
}

impl Default for FfmpegOptions {
    fn default() -> Self {
        Self {
            normalize_loudness: true,
            custom_command: None,
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct TranscribeOptions {
    pub path: String,
    pub lang: Option<String>,
    pub verbose: Option<bool>,
    pub n_threads: Option<i32>,
    pub init_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub translate: Option<bool>,
    pub max_text_ctx: Option<i32>,
    pub word_timestamps: Option<bool>,
    pub max_sentence_len: Option<i32>,
    pub sampling_strategy: Option<String>,
    pub best_of: Option<i32>,
    pub beam_size: Option<i32>,
    pub diarize_model: Option<String>,
    pub stable_timestamps: Option<bool>,
    pub vad_model: Option<String>,
}

pub(crate) const SERVER_DIED: &str = "vibe-server process died during transcription";

/// One failed attempt, and whether the sidecar died under it: the CPU retry needs both.
struct AttemptError {
    error: CommandError,
    died: bool,
}

impl AttemptError {
    fn alive(error: CommandError) -> Self {
        Self { error, died: false }
    }
}

/// Turn a transcription failure into something diagnosable: a send failure or a
/// mid-stream decode error is usually the sidecar dying, and only the child
/// itself knows the exit code, the signal, and what it printed on the way out.
async fn transcribe_error(server_state: &State<'_, Mutex<ServerState>>, error: eyre::Error) -> AttemptError {
    if let Some(api_error) = error.downcast_ref::<crate::server::ServerApiError>() {
        return AttemptError::alive(CommandError {
            code: api_error.code.clone(),
            message: api_error.message.clone(),
        });
    }
    match crate::server::death_report(server_state, SERVER_DIED).await {
        Some(message) => AttemptError {
            error: CommandError {
                code: "internal_error".to_string(),
                message,
            },
            died: true,
        },
        None => {
            let mut command_error = CommandError::from(error);
            let stderr = crate::server::recent_stderr(server_state).await;
            if !stderr.is_empty() {
                command_error.message.push_str(&format!("\n\nvibe-server stderr: {stderr}"));
            }
            AttemptError::alive(command_error)
        }
    }
}

/// Whether an `abort_transcribe` payload names this transcription. The payload is the
/// id as a JSON string; an event without one (`null`, or anything else) aborts nothing,
/// so a cancel in one place can never stop a transcription started from another.
pub(crate) fn abort_targets(payload: &str, transcription_id: &str) -> bool {
    serde_json::from_str::<Option<String>>(payload)
        .ok()
        .flatten()
        .is_some_and(|target| target == transcription_id)
}

/// The `abort_transcribe` listener of one transcription, removed when the command ends.
/// Listeners used to stay registered forever, one more per transcription.
struct AbortListener {
    app_handle: tauri::AppHandle,
    id: Option<EventId>,
}

impl AbortListener {
    /// Without an id there is nothing an abort could name, so nothing is registered.
    fn register(app_handle: &tauri::AppHandle, transcription_id: Option<String>, abort: Arc<AtomicBool>) -> Self {
        let id = transcription_id.filter(|id| !id.is_empty()).map(|transcription_id| {
            let app_handle_c = app_handle.clone();
            app_handle.listen("abort_transcribe", move |event| {
                if abort_targets(event.payload(), &transcription_id) {
                    let _ = set_progress_bar(&app_handle_c, None);
                    abort.store(true, Ordering::Relaxed);
                }
            })
        });
        Self {
            app_handle: app_handle.clone(),
            id,
        }
    }
}

impl Drop for AbortListener {
    fn drop(&mut self) {
        if let Some(id) = self.id.take() {
            self.app_handle.unlisten(id);
        }
    }
}

/// What a dying allocation prints. A GPU out of memory is the queue's to handle: it
/// reloads on the CPU itself and remembers the model for later launches.
fn is_allocation_failure(message: &str) -> bool {
    message.contains("memory allocation of") && message.contains("bytes failed")
}

/// Whether a failed transcription gets one more go with the model reloaded on the CPU.
/// Only a GPU failure mid-run qualifies: the sidecar dying under it (a lost Vulkan device
/// used to take the process down) or an internal error (what a failed ggml graph compute
/// reports instead). User errors, busy, no model and out-of-memory keep their own handling,
/// and a run already on the CPU, or already retried, has nothing left to try.
pub(crate) fn should_retry_on_cpu(error: &CommandError, died: bool, loaded_on_gpu: bool, retried: bool) -> bool {
    if retried || !loaded_on_gpu || is_allocation_failure(&error.message) {
        return false;
    }
    died || error.code == "internal_error"
}

async fn loaded_on_gpu(server_state: &State<'_, Mutex<ServerState>>) -> bool {
    let state = server_state.lock().await;
    state
        .process
        .as_ref()
        .and_then(|process| process.loaded_model())
        .is_some_and(|model| model.gpu)
}

#[tauri::command]
pub async fn transcribe(
    app_handle: tauri::AppHandle,
    options: TranscribeOptions,
    // Optional so older callers keep working; an `abort_transcribe` must name it to cancel.
    transcription_id: Option<String>,
    server_state: State<'_, Mutex<ServerState>>,
) -> Result<Transcript, CommandError> {
    // Validate file exists before attempting transcription
    let audio_path = PathBuf::from(&options.path);
    if !audio_path.exists() {
        return Err(CommandError {
            code: "invalid_request".to_string(),
            message: format!("Audio file not found: {}", options.path),
        });
    }
    if !audio_path.is_file() {
        return Err(CommandError {
            code: "invalid_request".to_string(),
            message: format!("Path is not a file: {}", options.path),
        });
    }

    let abort = Arc::new(AtomicBool::new(false));
    let _abort_listener = AbortListener::register(&app_handle, transcription_id.clone(), abort.clone());

    let mut retried = false;
    loop {
        let failure = match run_attempt(&app_handle, &options, &server_state, &abort).await {
            Ok(transcript) => return Ok(transcript),
            Err(failure) => failure,
        };
        if abort.load(Ordering::Relaxed)
            || !should_retry_on_cpu(&failure.error, failure.died, loaded_on_gpu(&server_state).await, retried)
        {
            return Err(failure.error);
        }
        retried = true;
        tracing::warn!(
            code = %failure.error.code,
            died = failure.died,
            "transcription failed with the GPU enabled; reloading the model on the CPU and retrying once: {}",
            failure.error.message
        );
        crate::analytics::track_event_handle_with_props(
            &app_handle,
            crate::analytics::events::SERVER_GPU_TRANSCRIBE_FALLBACK,
            Some(serde_json::json!({ "died": failure.died })),
        );
        // The segments streamed so far belong to the failed attempt; the retry sends them again.
        app_handle
            .emit_to("main", "transcribe_restart", transcription_id.as_deref())
            .log_error();
        let _ = set_progress_bar(&app_handle, Some(0.0));
        if let Err(reload_error) = super::server_cmd::reload_loaded_model_on_cpu(&app_handle).await {
            tracing::error!("reloading the model on the CPU failed: {reload_error:#}");
            let _ = set_progress_bar(&app_handle, None);
            return Err(CommandError {
                code: failure.error.code,
                message: format!("{}\n\nRetrying on the CPU failed: {reload_error:#}", failure.error.message),
            });
        }
        if abort.load(Ordering::Relaxed) {
            // Cancelled during the reload: an abort resolves like one mid-stream, with what it has.
            let _ = set_progress_bar(&app_handle, None);
            return Ok(Transcript {
                processing_time_sec: 0,
                segments: Vec::new(),
            });
        }
    }
}

/// One pass over the server's event stream, forwarding progress and segments to the window.
async fn run_attempt(
    app_handle: &tauri::AppHandle,
    options: &TranscribeOptions,
    server_state: &State<'_, Mutex<ServerState>>,
    abort: &AtomicBool,
) -> Result<Transcript, AttemptError> {
    // Read per attempt: a CPU retry runs against a freshly spawned process on a new port.
    let (client, base_url) = {
        let state = server_state.lock().await;
        let process = state.process.as_ref().ok_or_else(|| {
            AttemptError::alive(CommandError {
                code: "no_model".to_string(),
                message: "Please load model first".to_string(),
            })
        })?;
        (process.client(), process.base_url())
    }; // lock released here, before any I/O

    let start = std::time::Instant::now();

    let stream = match crate::server::ServerProcess::transcribe_stream(&client, &base_url, options).await {
        Ok(stream) => stream,
        Err(e) => return Err(transcribe_error(server_state, e).await),
    };

    tokio::pin!(stream);

    let mut segments = Vec::new();
    let mut completed = false;

    while let Some(event_result) = stream.next().await {
        if abort.load(Ordering::Relaxed) {
            tracing::debug!("transcription aborted by user");
            break;
        }

        match event_result {
            Ok(event) => match event {
                ServerEvent::Stage { stage } => {
                    app_handle.emit_to("main", "transcribe_stage", stage).log_error();
                }
                ServerEvent::Progress { progress } => {
                    let _ = set_progress_bar(app_handle, Some(progress.into()));
                }
                ServerEvent::Segment {
                    start,
                    end,
                    text,
                    speaker,
                    words,
                } => {
                    let segment = Segment::from_server(start, end, text, speaker, words);
                    app_handle.emit_to("main", "new_segment", segment.clone()).log_error();
                    segments.push(segment);
                }
                ServerEvent::Result { .. } => {
                    tracing::debug!("transcription complete");
                    completed = true;
                }
                ServerEvent::Error { code, message } => {
                    tracing::error!("vibe-server transcription error: {}", message);
                    let _ = set_progress_bar(app_handle, None);
                    return Err(AttemptError::alive(CommandError {
                        code: code.unwrap_or_else(|| "internal_error".to_string()),
                        message,
                    }));
                }
            },
            Err(e) => {
                tracing::error!("stream error: {:?}", e);
                let _ = set_progress_bar(app_handle, None);
                return Err(transcribe_error(server_state, e).await);
            }
        }
    }

    let _ = set_progress_bar(app_handle, None);

    if !abort.load(Ordering::Relaxed) && !completed {
        // A stream that just stops is almost always the sidecar dying under it;
        // say how it died rather than reporting a truncated stream.
        let report = crate::server::death_report(server_state, SERVER_DIED).await;
        let died = report.is_some();
        let message = report.unwrap_or_else(|| "vibe-server transcription stream ended before completion".to_string());
        return Err(AttemptError {
            error: CommandError {
                code: "internal_error".to_string(),
                message,
            },
            died,
        });
    }

    let elapsed = start.elapsed();
    Ok(Transcript {
        processing_time_sec: elapsed.as_secs(),
        segments,
    })
}

#[cfg(test)]
mod tests {
    use super::{abort_targets, should_retry_on_cpu, CommandError};

    const DIED: &str = "vibe-server process died during transcription (exited with code 1)";

    fn error(code: &str, message: &str) -> CommandError {
        CommandError {
            code: code.to_string(),
            message: message.to_string(),
        }
    }

    #[test]
    fn an_abort_names_its_transcription() {
        assert!(abort_targets("\"job-1\"", "job-1"));
        assert!(!abort_targets("\"job-2\"", "job-1"), "another transcription's cancel");
        assert!(!abort_targets("null", "job-1"), "a cancel with no id aborts nothing");
        assert!(!abort_targets("", "job-1"));
        assert!(!abort_targets("{\"id\":\"job-1\"}", "job-1"));
        assert!(!abort_targets("\"job-10\"", "job-1"));
    }

    #[test]
    fn a_gpu_death_mid_run_retries_on_the_cpu() {
        let died = error("internal_error", DIED);
        assert!(should_retry_on_cpu(&died, true, true, false));
    }

    #[test]
    fn an_internal_error_on_the_gpu_retries_on_the_cpu() {
        let failed = error("internal_error", "ggml operation failed: encoder graph compute");
        assert!(should_retry_on_cpu(&failed, false, true, false));
    }

    #[test]
    fn a_run_already_on_the_cpu_does_not_retry() {
        let died = error("internal_error", DIED);
        assert!(!should_retry_on_cpu(&died, true, false, false));
    }

    #[test]
    fn a_user_error_does_not_retry() {
        for code in [
            "invalid_audio",
            "invalid_request",
            "busy",
            "no_model",
            "aborted",
            "out_of_memory",
        ] {
            assert!(!should_retry_on_cpu(&error(code, "nope"), false, true, false), "{code}");
        }
    }

    #[test]
    fn a_gpu_out_of_memory_stays_with_the_queue() {
        assert!(!should_retry_on_cpu(&error("gpu_out_of_memory", "oom"), false, true, false));
        let death = error(
            "internal_error",
            "vibe-server process died during transcription (exited with code 1)\n\nvibe-server stderr: memory allocation of 123 bytes failed",
        );
        assert!(!should_retry_on_cpu(&death, true, true, false));
    }

    #[test]
    fn a_second_failure_does_not_retry() {
        let died = error("internal_error", DIED);
        assert!(!should_retry_on_cpu(&died, true, true, true));
    }
}
