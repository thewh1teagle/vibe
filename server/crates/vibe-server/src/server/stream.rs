use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use axum::body::Body;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use tokio_stream::wrappers::UnboundedReceiverStream;
use whisper_rs::StreamCallbacks;

use crate::audio;
use crate::cli::AppConfig;
use crate::server::diarization;
use crate::server::transcription::{audio_error, build_options};
use crate::server::unload_timeout::ModelLease;
use crate::server::{error, format, speakers};

/// What a streamed request still has to turn into samples and speaker turns.
pub(super) struct StreamInput {
    /// The uploaded file on disk; deleted when this drops.
    pub file: tempfile::TempPath,
    pub audio_options: audio::ReadOptions,
    pub diarize_model: Option<String>,
}

pub(super) fn stream_transcription(
    config: AppConfig,
    mut model: ModelLease,
    input: StreamInput,
    form: HashMap<String, String>,
    stable_timestamps: bool,
    vad_model_path: Option<String>,
) -> Result<Response, Box<Response>> {
    if model.ctx.is_none() {
        return Err(Box::new(error(
            StatusCode::SERVICE_UNAVAILABLE,
            "no_model",
            "no model loaded",
        )));
    }
    if model.ctx.as_ref().is_some_and(|ctx| ctx.requires_vad()) && vad_model_path.is_none() {
        return Err(Box::new(error(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "'vad_model' is required for this transcription engine",
        )));
    }

    let verbose = config.verbose();
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<Result<bytes::Bytes, std::convert::Infallible>>();
    let aborted = Arc::new(AtomicBool::new(false));
    let abort_for_progress = Arc::clone(&aborted);
    let abort_for_segment = Arc::clone(&aborted);
    let abort_for_poll = Arc::clone(&aborted);
    let progress_tx = tx.clone();
    let segment_tx = tx.clone();
    let final_tx = tx.clone();

    tokio::task::spawn_blocking(move || {
        let Some(ctx) = model.ctx.as_mut() else {
            let _ = send_event(
                &final_tx,
                serde_json::json!({
                    "type": "error",
                    "message": "no model loaded",
                }),
            );
            return;
        };

        // Everything before the first word is reported as a stage: on a long
        // file these steps take minutes and produce no progress of their own.
        let StreamInput {
            file,
            audio_options,
            diarize_model,
        } = input;
        let _ = send_stage(&final_tx, "preparing");
        let samples = match audio::read_file_with_options(&file, audio_options) {
            Ok(samples) => samples,
            Err(err) => {
                let (_, code, message) = audio_error(&err);
                let _ = send_event(
                    &final_tx,
                    serde_json::json!({
                        "type": "error",
                        "code": code,
                        "message": message,
                    }),
                );
                return;
            }
        };
        drop(file);
        let segment_diar_segments = match diarize_model.as_deref() {
            Some(model_path) if !final_tx.is_closed() => {
                let _ = send_stage(&final_tx, "speakers");
                diarization::diarize(model_path, &samples)
            }
            _ => Vec::new(),
        };
        let _ = send_stage(&final_tx, "transcribing");
        let opts = build_options(
            &form,
            verbose,
            stable_timestamps,
            vad_model_path,
            !segment_diar_segments.is_empty(),
        );

        let result = ctx.transcribe_stream(
            &samples,
            opts,
            StreamCallbacks {
                on_progress: Some(Box::new(move |progress| {
                    if send_event(
                        &progress_tx,
                        serde_json::json!({
                            "type": "progress",
                            "progress": progress,
                        }),
                    )
                    .is_err()
                    {
                        abort_for_progress.store(true, Ordering::SeqCst);
                    }
                })),
                on_segment: Some(Box::new(move |segment| {
                    // One event per speaker run, so a segment spanning speakers arrives split.
                    for turn in speakers::attribute(&segment, &segment_diar_segments) {
                        if send_event(&segment_tx, segment_event(turn)).is_err() {
                            abort_for_segment.store(true, Ordering::SeqCst);
                            return;
                        }
                    }
                })),
                should_abort: Some(Box::new(move || {
                    abort_for_poll.load(Ordering::SeqCst) || final_tx.is_closed()
                })),
            },
        );

        match result {
            Ok(result) => {
                let _ = send_event(
                    &tx,
                    serde_json::json!({
                        "type": "result",
                        "text": result.text(),
                    }),
                );
            }
            Err(err) => {
                tracing::error!("streaming transcription failed: {err:#}");
                if tx.is_closed() {
                    return;
                }
                let _ = send_event(
                    &tx,
                    serde_json::json!({
                        "type": "error",
                        "code": crate::server::engine_error_code(&err),
                        "message": err.to_string(),
                    }),
                );
            }
        }
    });

    let stream = UnboundedReceiverStream::new(rx);
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/x-ndjson"),
            (header::CACHE_CONTROL, "no-cache"),
            (header::CONNECTION, "keep-alive"),
        ],
        Body::from_stream(stream),
    )
        .into_response())
}

/// The `segment` event of one speaker run. `speaker` and `words` are left out
/// rather than sent empty, so a client that predates them reads the same event.
fn segment_event(turn: speakers::Turn) -> serde_json::Value {
    let mut event = serde_json::json!({
        "type": "segment",
        "start": format::cs_to_seconds(turn.start),
        "end": format::cs_to_seconds(turn.end),
        "text": turn.text,
        "no_speech_prob": turn.no_speech_prob,
    });
    if let Some(speaker) = turn.speaker {
        event["speaker"] = serde_json::json!(speaker);
    }
    if !turn.words.is_empty() {
        event["words"] = serde_json::json!(format::verbose_words(turn.words));
    }
    event
}

fn send_stage(
    tx: &tokio::sync::mpsc::UnboundedSender<Result<bytes::Bytes, std::convert::Infallible>>,
    stage: &str,
) -> Result<(), ()> {
    send_event(tx, serde_json::json!({ "type": "stage", "stage": stage }))
}

fn send_event(
    tx: &tokio::sync::mpsc::UnboundedSender<Result<bytes::Bytes, std::convert::Infallible>>,
    value: serde_json::Value,
) -> Result<(), ()> {
    let mut line = serde_json::to_vec(&value).map_err(|_| ())?;
    line.push(b'\n');
    tx.send(Ok(bytes::Bytes::from(line))).map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use whisper_rs::Word;

    fn turn(words: Vec<Word>) -> speakers::Turn {
        speakers::Turn {
            start: 120,
            end: 250,
            text: "Hello world.".into(),
            speaker: Some(1),
            no_speech_prob: 0.0,
            words,
        }
    }

    #[test]
    fn a_segment_event_carries_its_words_in_seconds() {
        let event = segment_event(turn(vec![
            Word {
                start: 120,
                end: 170,
                text: " Hello".into(),
            },
            Word {
                start: 180,
                end: 250,
                text: " world.".into(),
            },
        ]));
        assert_eq!(
            event,
            serde_json::json!({
                "type": "segment",
                "start": 1.2,
                "end": 2.5,
                "text": "Hello world.",
                "no_speech_prob": 0.0,
                "speaker": 1,
                "words": [
                    { "start": 1.2, "end": 1.7, "text": " Hello" },
                    { "start": 1.8, "end": 2.5, "text": " world." },
                ],
            })
        );
    }

    #[test]
    fn a_segment_event_without_words_omits_the_field() {
        let mut turn = turn(Vec::new());
        turn.speaker = None;
        let event = segment_event(turn);
        assert!(event.get("words").is_none());
        assert!(event.get("speaker").is_none());
        assert_eq!(event["text"], "Hello world.");
    }
}
