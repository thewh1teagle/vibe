use axum::http::StatusCode;
use axum::response::Response;
use whisper_rs::StreamCallbacks;

use crate::errors::{ApiError, ErrorCode};
use crate::state::SharedState;
use crate::transcription::form::RequestForm;
use crate::transcription::{options, response};

pub async fn once(state: SharedState, samples: Vec<f32>, form: RequestForm) -> Result<Response, ApiError> {
    let mut guard = transcriber(&state)?;
    let result = guard
        .context()
        .map_err(no_model)?
        .transcribe(&samples, options::from_form(&form))
        .map_err(internal_error)?;
    let speaker_segments = diarize_if_requested(&form, &samples);
    Ok(response::complete(&result, &form.response_format, &speaker_segments))
}

pub async fn stream(state: SharedState, samples: Vec<f32>, form: RequestForm) -> Result<Response, ApiError> {
    let mut guard = transcriber_owned(&state)?;
    guard.context().map_err(no_model)?;
    let speaker_segments = diarize_if_requested(&form, &samples);
    let (tx, rx) = response::channel();
    let response = response::stream(rx);

    tokio::task::spawn_blocking(move || run_streaming_transcription(guard, samples, form, speaker_segments, tx));
    Ok(response)
}

fn run_streaming_transcription(
    mut guard: crate::state::OwnedTranscriberGuard,
    samples: Vec<f32>,
    form: RequestForm,
    speaker_segments: Vec<crate::diarization::SpeakerSegment>,
    tx: response::StreamSender,
) {
    let progress_tx = tx.clone();
    let segment_tx = tx.clone();
    let abort_tx = tx.clone();

    let result = match guard.context() {
        Ok(ctx) => ctx.transcribe_with_callbacks(
            &samples,
            options::from_form(&form),
            StreamCallbacks {
                on_progress: Some(Box::new(move |progress| {
                    response::send(&progress_tx, response::StreamEvent::Progress { progress });
                })),
                on_segment: Some(Box::new(move |segment| {
                    response::send(&segment_tx, response::StreamEvent::segment(segment, &speaker_segments));
                })),
                should_abort: Some(Box::new(move || abort_tx.is_closed())),
            },
        ),
        Err(err) => {
            response::send(
                &tx,
                response::StreamEvent::Error {
                    message: err.to_string(),
                },
            );
            return;
        }
    };

    send_final_event(&tx, result);
}

fn diarize_if_requested(form: &RequestForm, samples: &[f32]) -> Vec<crate::diarization::SpeakerSegment> {
    if form.diarize_model.is_empty() {
        return Vec::new();
    }
    match crate::diarization::diarize(&form.diarize_model, samples) {
        Ok(segments) => segments,
        Err(err) => {
            eprintln!("diarization failed (skipping): {err:#}");
            Vec::new()
        }
    }
}

fn transcriber_owned(state: &SharedState) -> Result<crate::state::OwnedTranscriberGuard, ApiError> {
    state.try_transcriber_owned().map_err(|_| {
        ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            ErrorCode::Busy,
            "server is busy with another transcription",
        )
    })
}

fn transcriber(state: &SharedState) -> Result<crate::state::TranscriberGuard<'_>, ApiError> {
    state.try_transcriber().map_err(|_| {
        ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            ErrorCode::Busy,
            "server is busy with another transcription",
        )
    })
}

fn send_final_event(tx: &response::StreamSender, result: whisper_rs::Result<whisper_rs::TranscribeResult>) {
    let event = match result {
        Ok(result) => response::StreamEvent::Result { text: result.text() },
        Err(err) => response::StreamEvent::Error {
            message: err.to_string(),
        },
    };
    response::send(tx, event);
}

fn no_model(_err: anyhow::Error) -> ApiError {
    ApiError::new(StatusCode::SERVICE_UNAVAILABLE, ErrorCode::NoModel, "no model loaded")
}

fn internal_error(err: impl std::fmt::Display) -> ApiError {
    ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, ErrorCode::InternalError, err.to_string())
}
