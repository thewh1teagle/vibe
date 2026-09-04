use crate::error::LogError;
use crate::setup::SonaState;
use crate::sona::SonaEvent;
use crate::transcript::{Segment, Transcript};
use eyre::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Emitter, Listener, State};
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

pub(crate) const SONA_DIED: &str = "sona process died during transcription";

/// Turn a transcription failure into something diagnosable: a send failure or a
/// mid-stream decode error is usually the sidecar dying, and only the child
/// itself knows the exit code, the signal, and what it printed on the way out.
async fn transcribe_error(sona_state: &State<'_, Mutex<SonaState>>, error: eyre::Error) -> CommandError {
    if let Some(api_error) = error.downcast_ref::<crate::sona::SonaApiError>() {
        return CommandError {
            code: api_error.code.clone(),
            message: api_error.message.clone(),
        };
    }
    match crate::sona::death_report(sona_state, SONA_DIED).await {
        Some(message) => CommandError {
            code: "internal_error".to_string(),
            message,
        },
        None => {
            let mut command_error = CommandError::from(error);
            let stderr = crate::sona::recent_stderr(sona_state).await;
            if !stderr.is_empty() {
                command_error.message.push_str(&format!("\n\nsona stderr: {stderr}"));
            }
            command_error
        }
    }
}

#[tauri::command]
pub async fn transcribe(
    app_handle: tauri::AppHandle,
    options: TranscribeOptions,
    sona_state: State<'_, Mutex<SonaState>>,
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

    let (client, base_url) = {
        let state = sona_state.lock().await;
        let process = state.process.as_ref().ok_or_else(|| CommandError {
            code: "no_model".to_string(),
            message: "Please load model first".to_string(),
        })?;
        (process.client(), process.base_url())
    }; // lock released here, before any I/O

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    let app_handle_c = app_handle.clone();
    app_handle.listen("abort_transcribe", move |_| {
        let _ = set_progress_bar(&app_handle_c, None);
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let start = std::time::Instant::now();

    let stream = match crate::sona::SonaProcess::transcribe_stream(&client, &base_url, &options).await {
        Ok(stream) => stream,
        Err(e) => return Err(transcribe_error(&sona_state, e).await),
    };

    tokio::pin!(stream);

    let mut segments = Vec::new();
    let mut completed = false;

    while let Some(event_result) = stream.next().await {
        if abort_atomic.load(Ordering::Relaxed) {
            tracing::debug!("transcription aborted by user");
            break;
        }

        match event_result {
            Ok(event) => match event {
                SonaEvent::Progress { progress } => {
                    let _ = set_progress_bar(&app_handle, Some(progress.into()));
                }
                SonaEvent::Segment {
                    start,
                    end,
                    text,
                    speaker,
                } => {
                    let segment = Segment {
                        start: (start * 100.0) as i64,
                        stop: (end * 100.0) as i64,
                        text,
                        speaker,
                    };
                    app_handle.emit_to("main", "new_segment", segment.clone()).log_error();
                    segments.push(segment);
                }
                SonaEvent::Result { .. } => {
                    tracing::debug!("transcription complete");
                    completed = true;
                }
                SonaEvent::Error { code, message } => {
                    tracing::error!("sona transcription error: {}", message);
                    let _ = set_progress_bar(&app_handle, None);
                    return Err(CommandError {
                        code: code.unwrap_or_else(|| "internal_error".to_string()),
                        message,
                    });
                }
            },
            Err(e) => {
                tracing::error!("stream error: {:?}", e);
                let _ = set_progress_bar(&app_handle, None);
                return Err(transcribe_error(&sona_state, e).await);
            }
        }
    }

    let _ = set_progress_bar(&app_handle, None);

    if !abort_atomic.load(Ordering::Relaxed) && !completed {
        // A stream that just stops is almost always the sidecar dying under it;
        // say how it died rather than reporting a truncated stream.
        let message = crate::sona::death_report(&sona_state, SONA_DIED)
            .await
            .unwrap_or_else(|| "Sona transcription stream ended before completion".to_string());
        return Err(CommandError {
            code: "internal_error".to_string(),
            message,
        });
    }

    let elapsed = start.elapsed();
    let transcript = Transcript {
        processing_time_sec: elapsed.as_secs(),
        segments,
    };

    Ok(transcript)
}
