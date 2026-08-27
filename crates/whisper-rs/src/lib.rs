//! Pure-Rust whisper engine on the GGML runtime.
//!
//! The model format, compute graphs and decoding heuristics are ported from
//! whisper.cpp (verified bit-identical against the pinned commit before the
//! C++ dependency was dropped); only the ggml kernels themselves come from
//! the pinned GGML release linked through `ggml-rs-sys`.
//!
//! Two API levels: [`Context`] keeps the historical whisper-rs surface that
//! sona consumes, and [`Whisper`]/[`FullParams`] expose the engine directly.

mod error;
#[cfg_attr(not(feature = "ffi"), allow(dead_code))]
mod lang;
#[cfg_attr(not(feature = "ffi"), allow(dead_code))]
mod model_file;
mod options;

#[cfg(feature = "ffi")]
mod context;
#[cfg(feature = "ffi")]
mod decode;
#[cfg(feature = "ffi")]
mod devices;
#[cfg(feature = "ffi")]
mod encode;
#[cfg(feature = "ffi")]
mod full;
#[cfg(feature = "ffi")]
mod kv;
#[cfg(feature = "ffi")]
mod mel;
#[cfg(feature = "ffi")]
mod model;
#[cfg(feature = "ffi")]
mod sampling;
#[cfg(feature = "ffi")]
mod state;
#[cfg(feature = "ffi")]
mod timestamps;
#[cfg(feature = "ffi")]
mod vocab;

#[cfg(not(feature = "ffi"))]
mod stub;

pub use error::{Error, Result};
pub use options::{ContextOptions, StreamCallbacks, TranscribeOptions};

#[cfg(feature = "ffi")]
pub use context::{set_verbose, Context};
#[cfg(feature = "ffi")]
pub use devices::{list_gpu_devices, GPUDevice, GPUDeviceType};
#[cfg(feature = "ffi")]
pub use mel::{CHUNK_SIZE, HOP_LENGTH, N_FFT, SAMPLE_RATE};

#[cfg(not(feature = "ffi"))]
pub use stub::{list_gpu_devices, set_verbose, Context, GPUDevice, GPUDeviceType};

#[cfg(feature = "ffi")]
use std::path::Path;

/// Checks that a file is a whisper ggml model that can be loaded, without
/// loading it. Callers that only need to identify a file should use this
/// instead of assuming anything that is not another format is whisper.
pub fn validate_model_file(path: impl AsRef<std::path::Path>) -> Result<()> {
    model_file::validate(path.as_ref()).map(|_| ())
}

pub fn supported_languages() -> Vec<String> {
    lang::LANGUAGES.iter().map(|(code, _)| (*code).to_string()).collect()
}

/// One transcribed segment in the historical whisper-rs shape. Times are
/// centiseconds.
#[derive(Debug, Clone, PartialEq)]
pub struct Segment {
    pub start: i64,
    pub end: i64,
    pub text: String,
    pub no_speech_prob: f32,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct TranscribeResult {
    pub segments: Vec<Segment>,
}

impl TranscribeResult {
    pub fn text(&self) -> String {
        self.segments.iter().map(|segment| segment.text.as_str()).collect()
    }
}

/// Streaming hooks for the engine-level [`Whisper::full_stream`].
#[cfg(feature = "ffi")]
#[derive(Default)]
#[allow(clippy::type_complexity)]
pub struct FullCallbacks<'a> {
    pub on_progress: Option<Box<dyn FnMut(i32) + Send + 'a>>,
    pub on_new_segment: Option<Box<dyn FnMut(&FullSegment) + Send + 'a>>,
    pub should_abort: Option<Box<dyn FnMut() -> bool + Send + 'a>>,
}

#[cfg(feature = "ffi")]
/// One decoded token with its sampling metadata and (optional) timestamps —
/// `whisper_token_data`.
#[derive(Debug, Clone, PartialEq)]
pub struct TokenData {
    pub id: i32,
    /// Forced timestamp token id.
    pub tid: i32,
    pub p: f32,
    pub plog: f32,
    pub pt: f32,
    pub ptsum: f32,
    /// Token-level start/end time in centiseconds (-1 if not computed).
    pub t0: i64,
    pub t1: i64,
    /// Voice length heuristic used by the timestamp allocator.
    pub vlen: f32,
}

#[cfg(feature = "ffi")]
impl TokenData {
    pub(crate) fn empty() -> Self {
        Self {
            id: 0,
            tid: 0,
            p: 0.0,
            plog: 0.0,
            pt: 0.0,
            ptsum: 0.0,
            t0: -1,
            t1: -1,
            vlen: 0.0,
        }
    }
}

/// One transcribed segment — `whisper_segment`. Times are centiseconds.
#[cfg(feature = "ffi")]
#[derive(Debug, Clone, Default)]
pub struct FullSegment {
    pub t0: i64,
    pub t1: i64,
    pub text: String,
    pub no_speech_prob: f32,
    pub tokens: Vec<TokenData>,
    pub speaker_turn_next: bool,
}

#[cfg(feature = "ffi")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SamplingStrategy {
    Greedy,
    BeamSearch,
}

/// The `whisper_full_params` subset this port implements (no grammar, no
/// DTW timestamps, no external callbacks yet).
#[cfg(feature = "ffi")]
#[derive(Debug, Clone)]
pub struct FullParams {
    pub strategy: SamplingStrategy,
    pub n_threads: i32,
    pub n_max_text_ctx: i32,
    pub offset_ms: i32,
    pub duration_ms: i32,

    pub translate: bool,
    pub no_context: bool,
    pub no_timestamps: bool,
    pub single_segment: bool,
    pub print_special: bool,

    pub token_timestamps: bool,
    pub thold_pt: f32,
    pub thold_ptsum: f32,
    pub max_len: i32,
    pub split_on_word: bool,
    pub max_tokens: i32,

    pub tdrz_enable: bool,

    pub initial_prompt: Option<String>,
    pub carry_initial_prompt: bool,

    /// None or "auto" triggers language auto-detection on multilingual models.
    pub language: Option<String>,
    pub detect_language: bool,

    pub suppress_blank: bool,
    pub suppress_nst: bool,

    pub temperature: f32,
    pub max_initial_ts: f32,
    pub length_penalty: f32,

    pub temperature_inc: f32,
    pub entropy_thold: f32,
    pub logprob_thold: f32,
    pub no_speech_thold: f32,

    pub greedy_best_of: i32,
    pub beam_size: i32,
}

#[cfg(feature = "ffi")]
impl Default for FullParams {
    fn default() -> Self {
        Self {
            strategy: SamplingStrategy::Greedy,
            n_threads: (std::thread::available_parallelism().map(|c| c.get()).unwrap_or(4) as i32).min(4),
            n_max_text_ctx: 16384,
            offset_ms: 0,
            duration_ms: 0,
            translate: false,
            no_context: true,
            no_timestamps: false,
            single_segment: false,
            print_special: false,
            token_timestamps: false,
            thold_pt: 0.01,
            thold_ptsum: 0.01,
            max_len: 0,
            split_on_word: false,
            max_tokens: 0,
            tdrz_enable: false,
            initial_prompt: None,
            carry_initial_prompt: false,
            language: Some("en".to_string()),
            detect_language: false,
            suppress_blank: true,
            suppress_nst: false,
            temperature: 0.0,
            max_initial_ts: 1.0,
            length_penalty: -1.0,
            temperature_inc: 0.2,
            entropy_thold: 2.4,
            logprob_thold: -1.0,
            no_speech_thold: 0.6,
            greedy_best_of: 5,
            beam_size: 5,
        }
    }
}

/// A loaded whisper model plus its inference state — the equivalent of
/// `whisper_context` + `whisper_state`.
#[cfg(feature = "ffi")]
pub struct Whisper {
    model: model::Model,
    state: state::State,
    runtime: encode::Runtime,
}

#[cfg(feature = "ffi")]
impl Whisper {
    pub fn new(path: impl AsRef<Path>) -> Result<Self> {
        Self::with_threads(path, 4)
    }

    pub fn with_threads(path: impl AsRef<Path>, n_threads: i32) -> Result<Self> {
        let model = model::Model::load(path.as_ref())?;
        let state = state::State::new(&model, n_threads)?;
        let runtime = encode::Runtime::new(&state.backends)?;
        Ok(Self { model, state, runtime })
    }

    pub fn is_multilingual(&self) -> bool {
        self.model.vocab.is_multilingual()
    }

    pub fn n_mels(&self) -> i32 {
        self.model.hparams.n_mels
    }

    /// The detected (or requested) language id of the last `full` run.
    pub fn lang_id(&self) -> i32 {
        self.state.lang_id
    }

    pub fn lang_str(id: i32) -> Option<&'static str> {
        lang::lang_str(id as usize)
    }

    /// Transcribe `samples` (16 kHz mono f32) — the `whisper_full` port.
    /// Returns the decoded segments.
    pub fn full(&mut self, params: &FullParams, samples: &[f32]) -> Result<Vec<FullSegment>> {
        self.full_stream(params, samples, &mut FullCallbacks::default())
    }

    /// Like [`Whisper::full`], with progress/segment/abort hooks invoked as
    /// the transcription advances.
    pub fn full_stream(
        &mut self,
        params: &FullParams,
        samples: &[f32],
        callbacks: &mut FullCallbacks<'_>,
    ) -> Result<Vec<FullSegment>> {
        full::full(&self.model, &mut self.state, &mut self.runtime, params, samples, callbacks)
    }
}
