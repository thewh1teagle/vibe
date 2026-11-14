use std::collections::HashMap;

use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use whisper_rs::TranscribeOptions;

use crate::audio;
use crate::cli::AppConfig;
use crate::server::diarization;
use crate::server::form::FormValues;
use crate::server::stream::{stream_transcription, StreamInput};
use crate::server::unload_timeout::ModelLease;
use crate::server::{error, format, TextResponse};

pub(super) struct TranscriptionRequest {
    /// The uploaded file on disk; deleted when this drops.
    pub file: tempfile::TempPath,
    pub form: HashMap<String, String>,
}

pub(super) async fn transcribe(
    config: AppConfig,
    mut model: ModelLease,
    request: TranscriptionRequest,
) -> Result<Response, Response> {
    let TranscriptionRequest { file, form } = request;
    let (diarize_model, enhance_audio, stable_timestamps, vad_model_path, stream, response_format) = {
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
        verbose: config.verbose(),
    };
    if stable_timestamps && vad_model_path.is_none() {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "'vad_model' is required when 'stable_timestamps' is true",
        ));
    }

    // A streamed request answers at once and reports the slow steps before the
    // first word (decoding the audio, diarization) as stage events, so the
    // caller is not left looking at nothing for minutes on a long file.
    if stream {
        return stream_transcription(
            config,
            model,
            StreamInput {
                file,
                audio_options,
                diarize_model,
            },
            form,
            stable_timestamps,
            vad_model_path,
        )
        .map_err(|err| *err);
    }

    let samples = audio::read_file_with_options(&file, audio_options).map_err(|err| {
        let (status, code, message) = audio_error(&err);
        error(status, code, &message)
    })?;
    // The decoded samples are all that is needed from here on; free the disk now rather
    // than after a transcription that can take as long as the audio.
    drop(file);

    let diar_segments = diarize_model
        .as_deref()
        .map_or_else(Vec::new, |model_path| diarization::diarize(model_path, &samples));

    let verbose = config.verbose();
    let ctx = model
        .ctx
        .as_mut()
        .ok_or_else(|| error(StatusCode::SERVICE_UNAVAILABLE, "no_model", "no model loaded"))?;

    if ctx.requires_vad() && vad_model_path.is_none() {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "'vad_model' is required for this transcription engine",
        ));
    }

    let opts = build_options(&form, verbose, stable_timestamps, vad_model_path, !diar_segments.is_empty());
    let result = ctx.transcribe(&samples, opts).map_err(|err| {
        tracing::error!(samples = samples.len(), "transcription failed: {err:#}");
        error(
            StatusCode::INTERNAL_SERVER_ERROR,
            super::engine_error_code(&err),
            &format!("transcription failed: {err}"),
        )
    })?;

    Ok(format_response(&response_format, &result, &diar_segments))
}

/// How a failed decode is reported. ffmpeg that is missing or cannot be started is the
/// server's problem, not the file's, so it is not called "invalid audio".
pub(super) fn audio_error(err: &anyhow::Error) -> (StatusCode, &'static str, String) {
    if err.downcast_ref::<audio::FfmpegError>().is_some() {
        // The error already names its io cause; `{err:#}` would print it twice.
        tracing::error!("{err}");
        (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", err.to_string())
    } else {
        (StatusCode::BAD_REQUEST, "invalid_audio", format!("invalid audio file: {err}"))
    }
}

/// Every engine times its words on every run, and speaker attribution splits
/// segments on them. `word_timestamps` only decides whether whisper also wraps
/// segments to `max_segment_len`; a diarized request has always turned it on.
pub(super) fn build_options(
    form: &HashMap<String, String>,
    verbose: bool,
    stable_timestamps: bool,
    vad_model_path: Option<String>,
    diarized: bool,
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
        word_timestamps: diarized || values.bool("word_timestamps"),
        max_segment_len: values.i32("max_segment_len"),
        sampling_greedy: form.get("sampling_strategy").is_none_or(|strategy| strategy != "beam_search"),
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
        "text" => ([(header::CONTENT_TYPE, "text/plain; charset=utf-8")], result.text()).into_response(),
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
        _ => Json(TextResponse { text: result.text() }).into_response(),
    }
}
