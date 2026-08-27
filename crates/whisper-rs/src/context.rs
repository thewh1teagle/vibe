//! The historical whisper-rs API surface (`Context`, `set_verbose`), now
//! implemented on the pure-Rust engine instead of whisper.cpp FFI. Option
//! mapping and callback semantics are kept from the previous implementation
//! so sona is unaffected.

use std::ffi::{c_char, c_void, CStr};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Once;

use ggml_rs_sys as ffi;

use crate::{
    model_file, ContextOptions, Error, FullCallbacks, FullParams, FullSegment, Result, SamplingStrategy, Segment,
    StreamCallbacks, TranscribeOptions, TranscribeResult, Whisper,
};

pub struct Context {
    whisper: Whisper,
}

impl Context {
    pub fn new(model_path: impl AsRef<Path>, options: ContextOptions) -> Result<Self> {
        let path = model_path.as_ref();
        install_abort_handler();

        // A malformed header should be reported cleanly rather than surfacing
        // as an engine load failure, so the file is checked first.
        let size = model_file::validate(path)?;
        model_file::check_available_memory(path, size)?;

        // The engine is CPU-only for now; the GPU knobs are accepted for
        // compatibility and ignored.
        let _ = options;

        Ok(Self {
            whisper: Whisper::new(path)?,
        })
    }

    pub fn transcribe(&mut self, samples: &[f32], options: TranscribeOptions) -> Result<TranscribeResult> {
        self.transcribe_stream(samples, options, StreamCallbacks::default())
    }

    pub fn transcribe_stream(
        &mut self,
        samples: &[f32],
        options: TranscribeOptions,
        mut callbacks: StreamCallbacks<'_>,
    ) -> Result<TranscribeResult> {
        if samples.is_empty() {
            return Err(Error::NoSamples);
        }
        set_verbose(options.verbose);

        if options.stable_timestamps {
            return transcribe_stable_timestamps(&mut self.whisper, samples, options, callbacks);
        }

        let params = full_params(&options);

        let mut engine_callbacks = FullCallbacks::default();
        if let Some(on_progress) = callbacks.on_progress.as_mut() {
            engine_callbacks.on_progress = Some(Box::new(&mut **on_progress));
        }
        if let Some(on_segment) = callbacks.on_segment.as_mut() {
            engine_callbacks.on_new_segment = Some(Box::new(|segment: &FullSegment| on_segment(convert(segment))));
        }
        if let Some(should_abort) = callbacks.should_abort.as_mut() {
            engine_callbacks.should_abort = Some(Box::new(&mut **should_abort));
        }

        let segments = self.whisper.full_stream(&params, samples, &mut engine_callbacks)?;
        drop(engine_callbacks);

        Ok(TranscribeResult {
            segments: segments.iter().map(convert).collect(),
        })
    }
}

fn convert(segment: &FullSegment) -> Segment {
    Segment {
        start: segment.t0,
        end: segment.t1,
        text: segment.text.clone(),
        no_speech_prob: segment.no_speech_prob,
    }
}

/// The stable-timestamps path: VAD the audio, transcribe each speech segment
/// on its own 30-second-free window and shift the timestamps back. Ported
/// from the previous `stable.rs`.
fn transcribe_stable_timestamps(
    whisper: &mut Whisper,
    samples: &[f32],
    options: TranscribeOptions,
    mut callbacks: StreamCallbacks<'_>,
) -> Result<TranscribeResult> {
    let vad_model_path = options.vad_model_path.as_deref().ok_or(Error::MissingVadModel)?;
    let mut vad = vad_rs::Vad::new(vad_model_path, vad_rs::Options::stable_timestamps())
        .map_err(|error| Error::Message(error.to_string()))?;
    let vad_segments = vad.segments(samples).map_err(|error| Error::Message(error.to_string()))?;
    if vad_segments.is_empty() {
        if let Some(on_progress) = callbacks.on_progress.as_mut() {
            on_progress(100);
        }
        return Ok(TranscribeResult::default());
    }

    let params = full_params(&options);
    let n_vad_segments = vad_segments.len();
    let mut result = TranscribeResult {
        segments: Vec::with_capacity(n_vad_segments),
    };

    for (index, vad_segment) in vad_segments.into_iter().enumerate() {
        if let Some(should_abort) = callbacks.should_abort.as_mut() {
            if should_abort() {
                return Err(Error::Aborted);
            }
        }

        let t0cs = vad_segment.start_centiseconds();
        let window = &samples[vad_segment.start_sample..vad_segment.end_sample];

        let decoded = {
            let mut engine_callbacks = FullCallbacks::default();
            if let Some(should_abort) = callbacks.should_abort.as_mut() {
                engine_callbacks.should_abort = Some(Box::new(&mut **should_abort));
            }
            whisper.full_stream(&params, window, &mut engine_callbacks)?
        };

        for segment in &decoded {
            let mut segment = convert(segment);
            segment.start += t0cs;
            segment.end += t0cs;
            if let Some(on_segment) = callbacks.on_segment.as_mut() {
                on_segment(segment.clone());
            }
            result.segments.push(segment);
        }

        if let Some(on_progress) = callbacks.on_progress.as_mut() {
            on_progress(((index + 1) * 100 / n_vad_segments) as i32);
        }
    }

    Ok(result)
}

/// Maps the historical `TranscribeOptions` onto the engine's `FullParams`,
/// mirroring the previous `full_params` over `whisper_full_default_params`.
fn full_params(options: &TranscribeOptions) -> FullParams {
    let mut params = FullParams {
        strategy: if !options.sampling_greedy && options.beam_size > 0 {
            SamplingStrategy::BeamSearch
        } else {
            SamplingStrategy::Greedy
        },
        ..FullParams::default()
    };
    params.print_special = options.verbose;
    params.detect_language = options.detect_language;
    params.translate = options.translate;
    params.token_timestamps = options.word_timestamps;
    // Segments are only wrapped when max_len is set, so split_on_word is
    // inert on its own; it just makes the wrap land on word boundaries.
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
        params.greedy_best_of = options.best_of;
    }
    if options.beam_size > 0 {
        params.beam_size = options.beam_size;
    }

    params.language = options.language.clone();
    params.initial_prompt = options.prompt.clone();
    params
}

/// Whether GGML's informational logging is forwarded to stderr.
/// Warnings and errors are always forwarded, whatever this is set to.
static VERBOSE: AtomicBool = AtomicBool::new(false);

pub fn set_verbose(verbose: bool) {
    VERBOSE.store(verbose, Ordering::Relaxed);
    install_abort_handler();
    unsafe { ffi::ggml_log_set(Some(ggml_log_callback), std::ptr::null_mut()) };
}

/// Registers the ggml abort hook so a `GGML_ASSERT` message reaches stderr
/// before the process dies. ggml calls `abort()` right after the hook
/// returns, so this only records the message.
pub(crate) fn install_abort_handler() {
    static INSTALLED: Once = Once::new();

    INSTALLED.call_once(|| {
        unsafe { ffi::ggml_set_abort_callback(Some(ggml_abort_callback)) };
    });
}

extern "C" fn ggml_log_callback(level: ffi::ggml_log_level, text: *const c_char, _user_data: *mut c_void) {
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

extern "C" fn ggml_abort_callback(message: *const c_char) {
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
