use crate::error::LogError;
use crate::server::ServerEvent;
use crate::setup::ServerState;
use crate::transcript::{Segment, Transcript};
use eyre::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::path::PathBuf;
use tauri::{Emitter, Listener, State};
use tokio::sync::{watch, Mutex};

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

// Retained cancellation must win even if the I/O is ready.
async fn wait_or_abort<T>(abort: &mut watch::Receiver<bool>, future: impl Future<Output = T>) -> Option<T> {
    tokio::select! {
        biased;
        _ = abort.wait_for(|should_abort| *should_abort) => None,
        result = future => Some(result),
    }
}

struct TranscribeCleanup {
    app_handle: tauri::AppHandle,
    listener: Option<tauri::EventId>,
}

impl Drop for TranscribeCleanup {
    fn drop(&mut self) {
        if let Some(listener) = self.listener.take() {
            self.app_handle.unlisten(listener);
        }
        let _ = set_progress_bar(&self.app_handle, None);
    }
}

/// Turn a transcription failure into something diagnosable: a send failure or a
/// mid-stream decode error is usually the sidecar dying, and only the child
/// itself knows the exit code, the signal, and what it printed on the way out.
async fn transcribe_error(server_state: &State<'_, Mutex<ServerState>>, error: eyre::Error) -> CommandError {
    if let Some(api_error) = error.downcast_ref::<crate::server::ServerApiError>() {
        return CommandError {
            code: api_error.code.clone(),
            message: api_error.message.clone(),
        };
    }
    match crate::server::death_report(server_state, SERVER_DIED).await {
        Some(message) => CommandError {
            code: "internal_error".to_string(),
            message,
        },
        None => {
            let mut command_error = CommandError::from(error);
            let stderr = crate::server::recent_stderr(server_state).await;
            if !stderr.is_empty() {
                command_error.message.push_str(&format!("\n\nvibe-server stderr: {stderr}"));
            }
            command_error
        }
    }
}

#[tauri::command]
pub async fn transcribe(
    app_handle: tauri::AppHandle,
    options: TranscribeOptions,
    server_state: State<'_, Mutex<ServerState>>,
) -> Result<Transcript, CommandError> {
    let mut cleanup = TranscribeCleanup {
        app_handle: app_handle.clone(),
        listener: None,
    };

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
        let state = server_state.lock().await;
        let process = state.process.as_ref().ok_or_else(|| CommandError {
            code: "no_model".to_string(),
            message: "Please load model first".to_string(),
        })?;
        (process.client(), process.base_url())
    }; // lock released here, before any I/O

    let (abort_tx, mut abort) = watch::channel(false);
    cleanup.listener = Some(app_handle.listen("abort_transcribe", move |_| {
        let _ = abort_tx.send(true);
    }));

    let start = std::time::Instant::now();

    let stream = match wait_or_abort(
        &mut abort,
        crate::server::ServerProcess::transcribe_stream(&client, &base_url, &options),
    )
    .await
    {
        Some(Ok(stream)) => stream,
        Some(Err(e)) => return Err(transcribe_error(&server_state, e).await),
        None => {
            tracing::debug!("transcription aborted by user");
            return Ok(Transcript {
                processing_time_sec: start.elapsed().as_secs(),
                segments: Vec::new(),
            });
        }
    };

    let mut stream = Box::pin(stream);
    let mut segments = Vec::new();
    let mut completed = false;

    while let Some(Some(event_result)) = wait_or_abort(&mut abort, stream.next()).await {
        if *abort.borrow() {
            break;
        }

        match event_result {
            Ok(event) => match event {
                ServerEvent::Progress { progress } => {
                    let _ = set_progress_bar(&app_handle, Some(progress.into()));
                }
                ServerEvent::Segment {
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
                ServerEvent::Result { .. } => {
                    tracing::debug!("transcription complete");
                    completed = true;
                }
                ServerEvent::Error { code, message } => {
                    tracing::error!("vibe-server transcription error: {}", message);
                    return Err(CommandError {
                        code: code.unwrap_or_else(|| "internal_error".to_string()),
                        message,
                    });
                }
            },
            Err(e) => {
                tracing::error!("stream error: {:?}", e);
                return Err(transcribe_error(&server_state, e).await);
            }
        }
    }

    // Disconnect before inspecting completion so silent inference can observe cancellation.
    drop(stream);

    if *abort.borrow() {
        tracing::debug!("transcription aborted by user");
    } else if !completed {
        // A stream that just stops is almost always the sidecar dying under it;
        // say how it died rather than reporting a truncated stream.
        let message = crate::server::death_report(&server_state, SERVER_DIED)
            .await
            .unwrap_or_else(|| "vibe-server transcription stream ended before completion".to_string());
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

#[cfg(test)]
mod tests {
    use super::wait_or_abort;
    use std::future::{pending, ready};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::time::Duration;
    use tokio::sync::{oneshot, watch};
    use tokio::time::timeout;

    #[tokio::test]
    async fn already_aborted_wins_over_ready_future() {
        let (abort_tx, mut abort) = watch::channel(false);
        abort_tx.send(true).unwrap();
        let mut polled = false;
        let result = wait_or_abort(&mut abort, async {
            polled = true;
            42
        })
        .await;

        assert_eq!(result, None);
        assert!(!polled);
        // Cancellation stays latched even after the receiver has seen it.
        assert_eq!(wait_or_abort(&mut abort, ready(42)).await, None);
    }

    #[tokio::test]
    async fn abort_wakes_silent_future_and_drops_it() {
        struct DropProbe(Arc<AtomicBool>);
        impl Drop for DropProbe {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }

        let (abort_tx, mut abort) = watch::channel(false);
        let (started_tx, started_rx) = oneshot::channel();
        let dropped = Arc::new(AtomicBool::new(false));
        let probe = DropProbe(dropped.clone());
        let task = tokio::spawn(async move {
            wait_or_abort(&mut abort, async move {
                let _probe = probe;
                started_tx.send(()).unwrap();
                pending::<()>().await;
            })
            .await
        });

        timeout(Duration::from_secs(1), async {
            started_rx.await.unwrap();
            assert!(!task.is_finished());
            assert!(!dropped.load(Ordering::SeqCst));
            abort_tx.send(true).unwrap();
            assert_eq!(task.await.unwrap(), None);
        })
        .await
        .expect("cancellation must not wait for an I/O event");
        assert!(dropped.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn normal_future_result_is_preserved() {
        let (_abort_tx, mut abort) = watch::channel(false);
        assert_eq!(wait_or_abort(&mut abort, ready(Ok::<_, &str>(42))).await, Some(Ok(42)));
        assert_eq!(
            wait_or_abort(&mut abort, ready(Err::<(), _>("server error"))).await,
            Some(Err("server error"))
        );
    }
}
