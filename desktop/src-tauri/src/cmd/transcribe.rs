use crate::error::LogError;
use crate::setup::SonaState;
use crate::sona::SonaEvent;
use crate::transcript::{Segment, Transcript};
use eyre::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Emitter, State};
use tokio::sync::Mutex;

use super::{AbortGuard, CommandError};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TranscriptionProvider {
    #[default]
    Local,
    Groq,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct TranscribeOptions {
    pub path: String,
    pub lang: Option<String>,
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
    pub stable_timestamps: Option<bool>,
    pub vad_model: Option<String>,
    #[serde(default)]
    pub provider: TranscriptionProvider,
    #[serde(skip_serializing)]
    pub groq_api_key: Option<String>,
}

#[tauri::command]
pub async fn transcribe(
    app_handle: tauri::AppHandle,
    options: TranscribeOptions,
    sona_state: State<'_, Mutex<SonaState>>,
) -> Result<Transcript, CommandError> {
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

    // Route to Groq cloud provider if selected
    if options.provider == TranscriptionProvider::Groq {
        let api_key = options.groq_api_key.as_deref().ok_or_else(|| CommandError {
            code: "invalid_request".to_string(),
            message: "Groq API key is required".to_string(),
        })?;
        if api_key.is_empty() {
            return Err(CommandError {
                code: "invalid_request".to_string(),
                message: "Groq API key is required".to_string(),
            });
        }

        tracing::debug!("transcribing via Groq API");
        let result = crate::groq::transcribe(api_key, &options.path, &options)
            .await
            .map_err(|e| CommandError {
                code: "groq_error".to_string(),
                message: e.to_string(),
            })?;

        // Emit segments for real-time UI updates
        for segment in &result.segments {
            app_handle.emit_to("main", "new_segment", segment.clone()).log_error();
        }

        return Ok(result);
    }

    // Default: local sona transcription
    let (client, base_url) = {
        let state = sona_state.lock().await;
        let process = state.process.as_ref().ok_or_else(|| CommandError {
            code: "no_model".to_string(),
            message: "Please load model first".to_string(),
        })?;
        (process.client(), process.base_url())
    };

    let abort = AbortGuard::new(&app_handle, "abort_transcribe");
    let start = std::time::Instant::now();

    let stream = crate::sona::SonaProcess::transcribe_stream(&client, &base_url, &options)
        .await
        .map_err(CommandError::from)?;

    tokio::pin!(stream);

    let mut segments = Vec::new();

    while let Some(event_result) = stream.next().await {
        if abort.is_aborted() {
            tracing::debug!("transcription aborted by user");
            break;
        }

        match event_result {
            Ok(event) => match event {
                SonaEvent::Progress { .. } => {}
                SonaEvent::Segment {
                    start,
                    end,
                    text,
                    speaker,
                } => {
                    let mut segment = Segment::from_secs(start, end, text);
                    segment.speaker = speaker;
                    app_handle.emit_to("main", "new_segment", segment.clone()).log_error();
                    segments.push(segment);
                }
                SonaEvent::Result { .. } => {
                    tracing::debug!("transcription complete");
                }
                SonaEvent::Error { code, message } => {
                    tracing::error!("sona transcription error: {}", message);
                    return Err(CommandError {
                        code: code.unwrap_or_else(|| "internal_error".to_string()),
                        message,
                    });
                }
            },
            Err(e) => {
                tracing::error!("stream error: {:?}", e);
                return Err(CommandError::from(e));
            }
        }
    }

    let elapsed = start.elapsed();

    Ok(Transcript {
        processing_time_sec: elapsed.as_secs(),
        segments,
    })
}
