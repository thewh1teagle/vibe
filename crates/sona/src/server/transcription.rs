use std::collections::HashMap;

use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use whisper_rs::TranscribeOptions;

use crate::audio;
use crate::server::diarization;
use crate::server::form::FormValues;
use crate::server::stream::stream_transcription;
use crate::server::{error, format, AppState, TextResponse};

pub(super) struct TranscriptionRequest {
    pub file: Vec<u8>,
    pub form: HashMap<String, String>,
}

pub(super) async fn transcribe(
    state: AppState,
    request: TranscriptionRequest,
) -> Result<Response, Response> {
    let TranscriptionRequest { file, form } = request;
    let (
        diarize_model,
        enhance_audio,
        stable_timestamps,
        vad_model_path,
        stream,
        response_format,
    ) = {
        let values = FormValues::new(&form);
        (
            values.string("diarize_model"),
            values.bool("enhance_audio"),
            values.bool("stable_timestamps"),
            values.string("vad_model"),
            values.bool("stream"),
            values.str_or("response_format", "json").to_string(),
        )
    };
    let audio_options = audio::ReadOptions {
        enhance_audio,
        verbose: state.config.verbose(),
    };
    let samples = audio::read_bytes_with_options(file, audio_options).map_err(|err| {
        error(
            StatusCode::BAD_REQUEST,
            "invalid_audio",
            &format!("invalid audio file: {err}"),
        )
    })?;

    let diar_segments = diarize_model
        .as_deref()
        .map_or_else(Vec::new, |model_path| {
            diarization::diarize(model_path, &samples)
        });

    if stable_timestamps && vad_model_path.is_none() {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "'vad_model' is required when 'stable_timestamps' is true",
        ));
    }

    if stream {
        return stream_transcription(
            state,
            samples,
            form,
            stable_timestamps,
            vad_model_path,
            diar_segments,
        )
        .map_err(|err| *err);
    }

    let mut guard = state.inner.try_lock().map_err(|_| {
        error(
            StatusCode::TOO_MANY_REQUESTS,
            "busy",
            "server is busy with another transcription",
        )
    })?;
    let verbose = state.config.verbose();
    let ctx = guard.ctx.as_mut().ok_or_else(|| {
        error(
            StatusCode::SERVICE_UNAVAILABLE,
            "no_model",
            "no model loaded",
        )
    })?;

    if ctx.requires_vad() && vad_model_path.is_none() {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "'vad_model' is required for this transcription engine",
        ));
    }

    let opts = build_options(&form, verbose, stable_timestamps, vad_model_path);
    let result = ctx.transcribe(&samples, opts).map_err(|err| {
        error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
            &format!("transcription failed: {err}"),
        )
    })?;

    Ok(format_response(&response_format, &result, &diar_segments))
}

pub(super) fn build_options(
    form: &HashMap<String, String>,
    verbose: bool,
    stable_timestamps: bool,
    vad_model_path: Option<String>,
) -> TranscribeOptions {
    let values = FormValues::new(form);
    TranscribeOptions {
        language: values.string("language"),
        detect_language: values.bool("detect_language"),
        translate: values.bool("translate"),
        threads: values.i32("n_threads"),
        prompt: values.string("prompt"),
        verbose,
        temperature: values.f32("temperature"),
        max_text_ctx: values.i32("max_text_ctx"),
        word_timestamps: values.bool("word_timestamps"),
        max_segment_len: values.i32("max_segment_len"),
        sampling_greedy: form
            .get("sampling_strategy")
            .is_none_or(|strategy| strategy != "beam_search"),
        best_of: values.i32("best_of"),
        beam_size: values.i32("beam_size"),
        stable_timestamps,
        vad_model_path,
    }
}

fn format_response(
    response_format: &str,
    result: &whisper_rs::TranscribeResult,
    diar_segments: &[diarization::Segment],
) -> Response {
    match response_format {
        "verbose_json" => Json(format::build_verbose_json(result, diar_segments)).into_response(),
        "text" => (
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            result.text(),
        )
            .into_response(),
        "srt" => (
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            format::format_srt(&result.segments),
        )
            .into_response(),
        "vtt" => (
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            format::format_vtt(&result.segments),
        )
            .into_response(),
        _ => Json(TextResponse {
            text: result.text(),
        })
        .into_response(),
    }
}
