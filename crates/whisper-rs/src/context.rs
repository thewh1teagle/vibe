use std::ffi::{CStr, CString, c_char, c_int, c_void};
use std::ptr::NonNull;

use whisper_rs_sys as sys;

use crate::error::{Result, WhisperError};
use crate::options::{Segment, StreamCallbacks, TranscribeOptions, TranscribeResult};

pub struct WhisperContext {
    ctx: NonNull<sys::whisper_context>,
}

unsafe impl Send for WhisperContext {}

impl WhisperContext {
    pub fn new(path: &str, gpu_device: Option<i32>, no_gpu: bool) -> Result<Self> {
        crate::logging::suppress_native_logs();
        let path = CString::new(path).map_err(|_| WhisperError::InvalidModelPath)?;
        let mut params = unsafe { sys::whisper_context_default_params() };
        params.use_gpu = !no_gpu;
        if let Some(device) = gpu_device {
            params.gpu_device = device;
        }
        let ctx = unsafe { sys::whisper_init_from_file_with_params(path.as_ptr(), params) };
        let ctx = NonNull::new(ctx).ok_or(WhisperError::ContextInit)?;
        Ok(Self { ctx })
    }

    pub fn transcribe(&mut self, samples: &[f32], options: TranscribeOptions) -> Result<TranscribeResult> {
        self.transcribe_with_callbacks(samples, options, StreamCallbacks::default())
    }

    pub fn transcribe_with_callbacks(
        &mut self,
        samples: &[f32],
        options: TranscribeOptions,
        callbacks: StreamCallbacks<'_>,
    ) -> Result<TranscribeResult> {
        let language = optional_cstring(&options.language)?;
        let prompt = optional_cstring(&options.prompt)?;
        let vad_model = optional_cstring(&options.vad_model_path)?;
        let mut state = CallbackState {
            callbacks,
            emitted_segments: 0,
        };
        let mut params = unsafe { sys::whisper_full_default_params(sys::whisper_sampling_strategy_WHISPER_SAMPLING_GREEDY) };

        if !options.sampling_greedy {
            params.strategy = sys::whisper_sampling_strategy_WHISPER_SAMPLING_BEAM_SEARCH;
        }
        params.n_threads = if options.threads > 0 {
            options.threads
        } else {
            std::thread::available_parallelism().map(|n| n.get() as i32).unwrap_or(4)
        };
        params.translate = options.translate;
        params.detect_language = options.detect_language;
        params.language = language.as_ref().map_or(std::ptr::null(), |value| value.as_ptr());
        params.initial_prompt = prompt.as_ref().map_or(std::ptr::null(), |value| value.as_ptr());
        params.temperature = options.temperature;
        if options.max_text_ctx > 0 {
            params.n_max_text_ctx = options.max_text_ctx;
        }
        params.token_timestamps = options.word_timestamps;
        params.max_len = options.max_segment_len;
        if options.best_of > 0 {
            params.greedy.best_of = options.best_of;
        }
        if options.beam_size > 0 {
            params.beam_search.beam_size = options.beam_size;
        }
        params.print_progress = options.print_progress;
        params.print_special = options.print_special;
        params.print_realtime = options.print_realtime;
        params.print_timestamps = options.print_timestamps;
        params.vad = options.stable_timestamps;
        params.vad_model_path = vad_model.as_ref().map_or(std::ptr::null(), |value| value.as_ptr());
        params.progress_callback = Some(progress_callback);
        params.progress_callback_user_data = &mut state as *mut _ as *mut c_void;
        params.new_segment_callback = Some(new_segment_callback);
        params.new_segment_callback_user_data = &mut state as *mut _ as *mut c_void;
        params.abort_callback = Some(abort_callback);
        params.abort_callback_user_data = &mut state as *mut _ as *mut c_void;

        let code = unsafe { sys::whisper_full(self.ctx.as_ptr(), params, samples.as_ptr(), samples.len() as c_int) };
        if code != 0 {
            return if code == -2 {
                Err(WhisperError::Cancelled)
            } else {
                Err(WhisperError::TranscriptionFailed(code))
            };
        }
        collect_segments(self.ctx.as_ptr())
    }
}

impl Drop for WhisperContext {
    fn drop(&mut self) {
        unsafe { sys::whisper_free(self.ctx.as_ptr()) }
    }
}

struct CallbackState<'a> {
    callbacks: StreamCallbacks<'a>,
    emitted_segments: i32,
}

unsafe extern "C" fn progress_callback(
    _ctx: *mut sys::whisper_context,
    _state: *mut sys::whisper_state,
    progress: c_int,
    data: *mut c_void,
) {
    let state = unsafe { &mut *(data as *mut CallbackState<'_>) };
    if let Some(callback) = state.callbacks.on_progress.as_mut() {
        callback(progress);
    }
}

unsafe extern "C" fn new_segment_callback(
    ctx: *mut sys::whisper_context,
    _state: *mut sys::whisper_state,
    count: c_int,
    data: *mut c_void,
) {
    let state = unsafe { &mut *(data as *mut CallbackState<'_>) };
    let Some(callback) = state.callbacks.on_segment.as_mut() else {
        return;
    };
    let total = unsafe { sys::whisper_full_n_segments(ctx) };
    let start = total.saturating_sub(count);
    for index in start..total {
        if index >= state.emitted_segments {
            if let Ok(segment) = read_segment(ctx, index) {
                callback(segment);
                state.emitted_segments = index + 1;
            }
        }
    }
}

unsafe extern "C" fn abort_callback(data: *mut c_void) -> bool {
    let state = unsafe { &mut *(data as *mut CallbackState<'_>) };
    state.callbacks.should_abort.as_mut().is_some_and(|callback| callback())
}

fn collect_segments(ctx: *mut sys::whisper_context) -> Result<TranscribeResult> {
    let count = unsafe { sys::whisper_full_n_segments(ctx) };
    let mut segments = Vec::with_capacity(count.max(0) as usize);
    for index in 0..count {
        segments.push(read_segment(ctx, index)?);
    }
    Ok(TranscribeResult { segments })
}

fn read_segment(ctx: *mut sys::whisper_context, index: c_int) -> Result<Segment> {
    let text = unsafe { sys::whisper_full_get_segment_text(ctx, index) };
    if text.is_null() {
        return Err(WhisperError::InvalidText);
    }
    let text = unsafe { CStr::from_ptr(text as *const c_char) }
        .to_str()
        .map_err(|_| WhisperError::InvalidText)?
        .to_string();
    let start_cs = unsafe { sys::whisper_full_get_segment_t0(ctx, index) };
    let end_cs = unsafe { sys::whisper_full_get_segment_t1(ctx, index) };
    Ok(Segment { start_cs, end_cs, text })
}

fn optional_cstring(value: &str) -> Result<Option<CString>> {
    if value.is_empty() {
        Ok(None)
    } else {
        CString::new(value).map(Some).map_err(|_| WhisperError::InvalidModelPath)
    }
}
