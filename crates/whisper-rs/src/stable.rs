use std::ffi::CString;
use std::path::PathBuf;
use std::ptr;

use crate::callbacks::{CallbackState, install_abort_callback};
use crate::context::{full_params, option_cstring, set_verbose};
use crate::{Error, Result, StreamCallbacks, TranscribeOptions, TranscribeResult, ffi};

pub(crate) fn transcribe_stable_timestamps(
    ctx: *mut ffi::whisper_context,
    samples: &[f32],
    options: TranscribeOptions,
    callbacks: StreamCallbacks<'_>,
) -> Result<TranscribeResult> {
    let vad_model_path = options
        .vad_model_path
        .as_deref()
        .ok_or(Error::MissingVadModel)?;
    let c_vad_model_path = CString::new(vad_model_path)?;

    set_verbose(options.verbose);

    let mut vad_params = unsafe { ffi::whisper_vad_default_context_params() };
    // The VAD model is small, and some ggml backends cannot execute all VAD
    // graph ops on GPU. Keep VAD on CPU while whisper decoding can still use GPU.
    vad_params.use_gpu = false;

    let vad_ctx = unsafe {
        ffi::whisper_vad_init_from_file_with_params(c_vad_model_path.as_ptr(), vad_params)
    };
    if vad_ctx.is_null() {
        return Err(Error::LoadVadModel(PathBuf::from(vad_model_path)));
    }
    let vad_ctx = VadContext(vad_ctx);

    let vad_segment_params = unsafe { ffi::whisper_vad_default_params() };
    let vad_segments = unsafe {
        ffi::whisper_vad_segments_from_samples(
            vad_ctx.0,
            vad_segment_params,
            samples.as_ptr(),
            samples
                .len()
                .try_into()
                .map_err(|_| Error::Message("sample count exceeds i32".to_string()))?,
        )
    };
    if vad_segments.is_null() {
        return Err(Error::VadSegmentationFailed);
    }
    let vad_segments = VadSegments(vad_segments);

    let n_vad_segments = unsafe { ffi::whisper_vad_segments_n_segments(vad_segments.0) };
    if n_vad_segments <= 0 {
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
        segments: Vec::with_capacity(n_vad_segments as usize),
    };

    for index in 0..n_vad_segments {
        if callback_state.should_abort() {
            return Err(Error::Aborted);
        }

        let t0cs =
            unsafe { ffi::whisper_vad_segments_get_segment_t0(vad_segments.0, index) } as i64;
        let t1cs =
            unsafe { ffi::whisper_vad_segments_get_segment_t1(vad_segments.0, index) } as i64;
        if t1cs <= t0cs {
            continue;
        }

        let start = vad_centiseconds_to_sample(t0cs, samples.len());
        let end = vad_centiseconds_to_sample(t1cs, samples.len());
        if end <= start {
            continue;
        }

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
            on_progress((index + 1) * 100 / n_vad_segments);
        }
    }

    Ok(result)
}

struct VadContext(*mut ffi::whisper_vad_context);

impl Drop for VadContext {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { ffi::whisper_vad_free(self.0) };
        }
    }
}

struct VadSegments(*mut ffi::whisper_vad_segments);

impl Drop for VadSegments {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { ffi::whisper_vad_free_segments(self.0) };
        }
    }
}

fn vad_centiseconds_to_sample(value: i64, sample_count: usize) -> usize {
    let sample = (value as f64 * ffi::WHISPER_SAMPLE_RATE as f64 / 100.0) as isize;
    sample.clamp(0, sample_count as isize) as usize
}
