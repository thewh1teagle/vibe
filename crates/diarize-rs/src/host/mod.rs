//! The host side of NVIDIA Streaming Sortformer v2: everything that is not the
//! neural forward pass.
//!
//! This is a port of the non-ONNX ~900 lines of `parakeet-rs 0.3.x`'s
//! `src/sortformer.rs` and `src/audio.rs`, vendored so that the ONNX Runtime
//! dependency can be dropped. Behaviour is preserved exactly; the only
//! structural change is that the single `session.run()` call has been replaced
//! by the [`Backend`] trait so that the ggml/GGUF graph in the `sf_*` modules
//! can be attached in its place.
//!
//! The pieces, in the order the audio flows through them:
//!
//! ```text
//! mel.rs      preemph -> STFT -> mel filterbank -> log      (NeMo normalize="NA")
//! aosc.rs     entry points, chunking and windowing
//! cache.rs    the FIFO/speaker-cache state machine and cache compression
//! backend.rs  the seam: one chunk in, embeddings + speaker probabilities out
//! segment.rs  median filter, hysteresis binarisation
//! config.rs   DiarizationConfig presets and SpeakerSegment
//! ```
//!
//! The state machine tracks NeMo's `sortformer_modules.py` closely enough that
//! the individual functions carry their upstream names; where the arithmetic is
//! subtle the comment says which NeMo behaviour is being reproduced.
//!
//! # Attribution
//!
//! Derived from <https://github.com/altunenes/parakeet-rs>, which is licensed
//! `MIT OR Apache-2.0`. Taken under the MIT option, whose notice the MIT-licensed
//! Sona repository must carry forward:
//!
//! > MIT License
//! >
//! > Copyright (c) 2025 Enes Altun
//! >
//! > Permission is hereby granted, free of charge, to any person obtaining a
//! > copy of this software and associated documentation files (the "Software"),
//! > to deal in the Software without restriction, including without limitation
//! > the rights to use, copy, modify, merge, publish, distribute, sublicense,
//! > and/or sell copies of the Software, and to permit persons to whom the
//! > Software is furnished to do so, subject to the following conditions:
//! >
//! > The above copyright notice and this permission notice shall be included in
//! > all copies or substantial portions of the Software.
//! >
//! > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//! > IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//! > FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//! > AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//! > LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
//! > FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
//! > DEALINGS IN THE SOFTWARE.

// Parts of the vendored surface (the streaming `feed`/`flush` entry points, the
// computed-filterbank fallback) are not reached from `lib.rs`'s one-shot
// `diarize`, but are kept intact so this stays diffable against upstream.
#![allow(dead_code)]

mod aosc;
mod backend;
mod cache;
mod config;
mod mel;
mod segment;

pub use aosc::{SortformerHost, StreamGeometry};
pub use backend::{Backend, ChunkForward, ChunkRequest};
pub use config::{DiarizationConfig, SpeakerSegment};
pub use mel::MelFrontend;

/// Errors raised by the host pipeline. Backend failures are boxed so that the
/// seam does not force a concrete error type on whoever implements it.
#[derive(Debug, thiserror::Error)]
pub enum HostError {
    #[error("audio error: {0}")]
    Audio(String),
    #[error("neural backend failed: {0}")]
    Backend(Box<dyn std::error::Error + Send + Sync>),
    #[error("backend returned {got} {what}, expected {want}")]
    BackendShape { what: &'static str, got: usize, want: usize },
}

pub type HostResult<T> = std::result::Result<T, HostError>;

// ---------------------------------------------------------------------------
// Model constants
// ---------------------------------------------------------------------------

/// FFT size. The 400-sample window is zero-padded into this.
pub(crate) const N_FFT: usize = 512;
/// Analysis window length in samples (25 ms).
pub(crate) const WIN_LENGTH: usize = 400;
/// Hop between frames in samples (10 ms).
pub(crate) const HOP_LENGTH: usize = 160;
/// Mel bands.
pub(crate) const N_MELS: usize = 128;
/// NeMo's `preemph`.
pub(crate) const PREEMPH: f32 = 0.97;
/// NeMo's `log_zero_guard_value`, i.e. 2^-24.
pub(crate) const LOG_ZERO_GUARD: f32 = 5.960_464_5e-8;
/// The only sample rate the model accepts.
pub(crate) const SAMPLE_RATE: usize = 16000;
/// Number of real FFT bins, `N_FFT / 2 + 1`.
pub(crate) const FREQ_BINS: usize = N_FFT / 2 + 1;

// Streaming geometry defaults. The upstream crate read these from ONNX
// metadata; with a GGUF they come from the hyper-parameter KVs instead, so
// [`StreamGeometry`] stays constructible from the outside.
/// Model frames emitted per chunk (~10 s at 80 ms/frame).
pub(crate) const CHUNK_LEN: usize = 124;
/// FIFO buffer length in model frames.
pub(crate) const FIFO_LEN: usize = 124;
/// Speaker cache length in model frames.
pub(crate) const SPKCACHE_LEN: usize = 188;
/// Lookahead frames: attended to, then discarded from the output.
pub(crate) const RIGHT_CONTEXT: usize = 1;
/// Mel frames per model frame (the pre-encode stem strides by 8).
pub(crate) const SUBSAMPLING: usize = 8;
/// Pre-encode embedding width.
pub(crate) const EMB_DIM: usize = 512;
/// The model is a fixed 4-speaker model.
pub const NUM_SPEAKERS: usize = 4;
/// Seconds covered by one model frame.
pub(crate) const FRAME_DURATION: f32 = 0.08;

// Cache compression parameters, from NeMo's `sortformer_modules.py`.
pub(crate) const SPKCACHE_SIL_FRAMES_PER_SPK: usize = 3;
pub(crate) const PRED_SCORE_THRESHOLD: f32 = 0.25;
pub(crate) const STRONG_BOOST_RATE: f32 = 0.75;
pub(crate) const WEAK_BOOST_RATE: f32 = 1.5;
pub(crate) const MIN_POS_SCORES_RATE: f32 = 0.5;
pub(crate) const SIL_THRESHOLD: f32 = 0.2;
/// Sentinel that sorts after every real flat index, marking a disabled slot.
pub(crate) const MAX_INDEX: usize = 99999;
