use std::ffi::{CStr, CString, c_void};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Once;

use crate::callbacks::{CallbackState, install_stream_callbacks};
use crate::model_file;
use crate::{
    ContextOptions, Error, Result, Segment, StreamCallbacks, TranscribeOptions, TranscribeResult,
};
use crate::{ffi, platform};

#[derive(Debug)]
pub struct Context {
    ctx: *mut ffi::whisper_context,
}

impl Context {
    pub fn new(model_path: impl AsRef<Path>, options: ContextOptions) -> Result<Self> {
        let path = model_path.as_ref();
        install_abort_handler();

        // whisper.cpp turns a malformed header into a GGML_ASSERT, so the file
        // is checked here while a failure can still be reported.
        let size = model_file::validate(path)?;
        model_file::check_available_memory(path, size)?;

        let mut params = unsafe { ffi::whisper_context_default_params() };
        params.use_gpu = !options.no_gpu && platform::vulkan_available();
        if options.gpu_device >= 0 {
            params.gpu_device = options.gpu_device;
        }

        // Loading from the path keeps a single copy of the weights in memory;
        // the buffer entry point would hold the whole file alongside them.
        let path_cstring = CString::new(path.as_os_str().to_string_lossy().as_ref())?;
        let ctx = unsafe { ffi::whisper_init_from_file_with_params(path_cstring.as_ptr(), params) };
        if ctx.is_null() {
            return Err(Error::LoadModel(PathBuf::from(path)));
        }

        Ok(Self { ctx })
    }

    pub fn transcribe(
        &mut self,
        samples: &[f32],
        options: TranscribeOptions,
    ) -> Result<TranscribeResult> {
        self.transcribe_stream(samples, options, StreamCallbacks::default())
    }

    pub fn transcribe_stream(
        &mut self,
        samples: &[f32],
        options: TranscribeOptions,
        callbacks: StreamCallbacks<'_>,
    ) -> Result<TranscribeResult> {
        if samples.is_empty() {
            return Err(Error::NoSamples);
        }
        if options.stable_timestamps {
            return crate::stable::transcribe_stable_timestamps(
                self.ctx, samples, options, callbacks,
            );
        }

        set_verbose(options.verbose);

        let language = option_cstring(options.language.as_deref())?;
        let prompt = option_cstring(options.prompt.as_deref())?;
        let mut params = full_params(&options);
        params.language = language.as_ref().map_or(ptr::null(), |s| s.as_ptr());
        params.initial_prompt = prompt.as_ref().map_or(ptr::null(), |s| s.as_ptr());

        let mut callback_state = CallbackState::new(callbacks);
        install_stream_callbacks(&mut params, &mut callback_state);

        let ret = unsafe {
            ffi::whisper_full(
                self.ctx,
                params,
                samples.as_ptr(),
                samples
                    .len()
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

        collect_segments(self.ctx)
    }
}

impl Drop for Context {
    fn drop(&mut self) {
        if !self.ctx.is_null() {
            unsafe { ffi::whisper_free(self.ctx) };
            self.ctx = ptr::null_mut();
        }
    }
}

unsafe impl Send for Context {}

/// Whether whisper.cpp's informational logging is forwarded to stderr.
/// Warnings and errors are always forwarded, whatever this is set to.
static VERBOSE: AtomicBool = AtomicBool::new(false);

pub fn set_verbose(verbose: bool) {
    VERBOSE.store(verbose, Ordering::Relaxed);
    install_abort_handler();
    unsafe { ffi::whisper_log_set(Some(whisper_log_callback), ptr::null_mut()) };
}

/// Registers the ggml abort hook so a `GGML_ASSERT` message reaches stderr
/// before the process dies. ggml calls `abort()` right after the hook returns,
/// so this only records the message.
pub(crate) fn install_abort_handler() {
    static INSTALLED: Once = Once::new();

    INSTALLED.call_once(|| {
        unsafe { ffi::ggml_set_abort_callback(Some(ggml_abort_callback)) };
    });
}

pub(crate) fn option_cstring(value: Option<&str>) -> Result<Option<CString>> {
    value.map(CString::new).transpose().map_err(Error::from)
}

pub(crate) fn full_params(options: &TranscribeOptions) -> ffi::whisper_full_params {
    let strategy = if !options.sampling_greedy && options.beam_size > 0 {
        ffi::whisper_sampling_strategy_WHISPER_SAMPLING_BEAM_SEARCH
    } else {
        ffi::whisper_sampling_strategy_WHISPER_SAMPLING_GREEDY
    };

    let mut params = unsafe { ffi::whisper_full_default_params(strategy) };
    params.print_special = options.verbose;
    params.print_progress = options.verbose;
    params.print_realtime = options.verbose;
    params.print_timestamps = options.verbose;
    params.detect_language = options.detect_language;
    params.translate = options.translate;
    params.token_timestamps = options.word_timestamps;
    // whisper.cpp only wraps segments when max_len is set, so split_on_word is inert
    // on its own. Callers that want word-sized segments ask for them with
    // max_segment_len; this just makes the wrap land on word boundaries.
    params.split_on_word = options.word_timestamps;

    if options.threads > 0 {
        params.n_threads = options.threads;
    }
    if options.max_text_ctx > 0 {
        params.n_max_text_ctx = options.max_text_ctx;
    }
    if options.max_segment_len > 0 {
        params.max_len = options.max_segment_len;
    }
    if options.temperature > 0.0 {
        params.temperature = options.temperature;
    }
    if options.best_of > 0 {
        params.greedy.best_of = options.best_of;
    }
    if options.beam_size > 0 {
        params.beam_search.beam_size = options.beam_size;
    }
    params
}

pub(crate) fn collect_segments(ctx: *mut ffi::whisper_context) -> Result<TranscribeResult> {
    let n_segments = unsafe { ffi::whisper_full_n_segments(ctx) };
    if n_segments < 0 {
        return Err(Error::Message(
            "negative segment count from whisper.cpp".to_string(),
        ));
    }

    let mut segments = Vec::with_capacity(n_segments as usize);
    for index in 0..n_segments {
        segments.push(segment_at(ctx, index));
    }
    Ok(TranscribeResult { segments })
}

fn segment_at(ctx: *mut ffi::whisper_context, index: i32) -> Segment {
    let text_ptr = unsafe { ffi::whisper_full_get_segment_text(ctx, index) };
    let text = if text_ptr.is_null() {
        String::new()
    } else {
        unsafe { CStr::from_ptr(text_ptr) }
            .to_string_lossy()
            .into_owned()
    };

    Segment {
        start: unsafe { ffi::whisper_full_get_segment_t0(ctx, index) },
        end: unsafe { ffi::whisper_full_get_segment_t1(ctx, index) },
        text,
        no_speech_prob: unsafe { ffi::whisper_full_get_segment_no_speech_prob(ctx, index) },
    }
}

extern "C" fn whisper_log_callback(
    level: ffi::ggml_log_level,
    text: *const libc::c_char,
    _user_data: *mut c_void,
) {
    if text.is_null() || !should_log(level) {
        return;
    }
    eprint!("{}", unsafe { CStr::from_ptr(text) }.to_string_lossy());
    let _ = std::io::stderr().flush();
}

/// Warnings and errors always get through; everything else needs `--verbose`.
/// A `CONT` line continues whichever line was logged before it, so it follows
/// the same decision.
fn should_log(level: ffi::ggml_log_level) -> bool {
    static LAST_LOGGED: AtomicBool = AtomicBool::new(false);

    let logged = match level {
        ffi::ggml_log_level_GGML_LOG_LEVEL_WARN | ffi::ggml_log_level_GGML_LOG_LEVEL_ERROR => true,
        ffi::ggml_log_level_GGML_LOG_LEVEL_CONT => LAST_LOGGED.load(Ordering::Relaxed),
        _ => VERBOSE.load(Ordering::Relaxed),
    };
    if level != ffi::ggml_log_level_GGML_LOG_LEVEL_CONT {
        LAST_LOGGED.store(logged, Ordering::Relaxed);
    }
    logged
}

extern "C" fn ggml_abort_callback(message: *const libc::c_char) {
    let message = if message.is_null() {
        "(no message)".to_string()
    } else {
        unsafe { CStr::from_ptr(message) }.to_string_lossy().into_owned()
    };
    // ggml aborts as soon as this returns, so the message has to be flushed now.
    eprintln!("ggml fatal error: {}", message.trim_end());
    let _ = std::io::stderr().flush();
    tracing::error!(target: "whisper_rs", "ggml fatal error: {}", message.trim_end());
}
