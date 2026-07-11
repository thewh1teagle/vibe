use std::ptr;

use crate::callbacks::{install_abort_callback, CallbackState};
use crate::context::{full_params, option_cstring, set_verbose};
use crate::{ffi, Error, Result, StreamCallbacks, TranscribeOptions, TranscribeResult};

pub(crate) fn transcribe_stable_timestamps(
    ctx: *mut ffi::whisper_context,
    samples: &[f32],
    options: TranscribeOptions,
    callbacks: StreamCallbacks<'_>,
) -> Result<TranscribeResult> {
    let vad_model_path = options.vad_model_path.as_deref().ok_or(Error::MissingVadModel)?;
    set_verbose(options.verbose);
    let mut vad = vad_rs::Vad::new(vad_model_path, vad_rs::Options::stable_timestamps())
        .map_err(|error| Error::Message(error.to_string()))?;
    let vad_segments = vad.segments(samples).map_err(|error| Error::Message(error.to_string()))?;
    if vad_segments.is_empty() {
        let mut callback_state = CallbackState::new(callbacks);
        if let Some(on_progress) = callback_state.callbacks.on_progress.as_mut() {
            on_progress(100);
        }
        return Ok(TranscribeResult::default());
    }

    let language = option_cstring(options.language.as_deref())?;
    let prompt = option_cstring(options.prompt.as_deref())?;
    let mut callback_state = CallbackState::new(callbacks);
    let mut result = TranscribeResult {
        segments: Vec::with_capacity(vad_segments.len()),
    };

    let n_vad_segments = vad_segments.len();
    for (index, vad_segment) in vad_segments.into_iter().enumerate() {
        if callback_state.should_abort() {
            return Err(Error::Aborted);
        }

        let start = vad_segment.start_sample;
        let end = vad_segment.end_sample;
        let t0cs = vad_segment.start_centiseconds();

        let mut params = full_params(&options);
        params.vad = false;
        params.vad_model_path = ptr::null();
        params.language = language.as_ref().map_or(ptr::null(), |s| s.as_ptr());
        params.initial_prompt = prompt.as_ref().map_or(ptr::null(), |s| s.as_ptr());
        install_abort_callback(&mut params, &mut callback_state);

        let ret = unsafe {
            ffi::whisper_full(
                ctx,
                params,
                samples[start..end].as_ptr(),
                (end - start)
                    .try_into()
                    .map_err(|_| Error::Message("sample count exceeds i32".to_string()))?,
            )
        };
        if ret != 0 {
            if callback_state.aborted {
                return Err(Error::Aborted);
            }
            return Err(Error::TranscriptionFailed(ret));
        }

        let decoded = crate::context::collect_segments(ctx)?;
        for mut segment in decoded.segments {
            segment.start += t0cs;
            segment.end += t0cs;
            if let Some(on_segment) = callback_state.callbacks.on_segment.as_mut() {
                on_segment(segment.clone());
            }
            result.segments.push(segment);
        }

        if let Some(on_progress) = callback_state.callbacks.on_progress.as_mut() {
            on_progress(((index + 1) * 100 / n_vad_segments) as i32);
        }
    }

    Ok(result)
}
