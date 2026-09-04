//! The seam between the host state machine and the neural forward pass.
//!
//! In the upstream ONNX crate this was one `session.run()` call taking six
//! named inputs and returning two tensors
//! (`plans/parakeet-rs/src/sortformer.rs:574-600`). Everything about that call
//! that is not ONNX-specific is captured below, so that the ggml graph in
//! `sf_graph.rs` — whose `run_chunk` already returns exactly NeMo's
//! `chunk_pre_encode_embs` and `spkcache_fifo_chunk_preds` — can be dropped in
//! behind this trait without the state machine changing.

use super::{HostError, EMB_DIM, NUM_SPEAKERS};

/// One chunk's worth of inputs to the neural graph.
///
/// All slices are borrowed from the host state; an implementation should treat
/// them as read-only for the duration of the call.
pub struct ChunkRequest<'a> {
    /// The chunk's mel window, **mel-major**: `mel[m * mel_frames + f]`.
    ///
    /// This is the layout the ggml `[frames, n_mels]` input tensor consumes
    /// verbatim (ggml's `ne[0]` is the fastest-varying axis). The host DSP
    /// produces frame-major `(B, T, D)`, so the state machine transposes on the
    /// way in — a real trap when repointing the ONNX host, whose `chunk` input
    /// was frame-major.
    pub mel: &'a [f32],
    /// Number of mel frames in `mel`, including any zero padding.
    pub mel_frames: usize,
    /// Valid (unpadded) mel frames — ONNX's `chunk_lengths`.
    pub current_len: usize,
    /// Speaker cache embeddings, row-major `[spkcache_frames, EMB_DIM]`.
    pub spkcache: &'a [f32],
    pub spkcache_frames: usize,
    /// FIFO embeddings, row-major `[fifo_frames, EMB_DIM]`.
    pub fifo: &'a [f32],
    pub fifo_frames: usize,
}

/// What the graph hands back.
pub struct ChunkForward {
    /// Pre-encode embeddings for this chunk, row-major
    /// `[embedding_frames, EMB_DIM]` — NeMo's `chunk_pre_encode_embs`.
    pub embeddings: Vec<f32>,
    pub embedding_frames: usize,
    /// Speaker probabilities over the whole `[spkcache | fifo | chunk]` concat,
    /// row-major `[prediction_frames, NUM_SPEAKERS]` — NeMo's
    /// `spkcache_fifo_chunk_preds`.
    pub predictions: Vec<f32>,
    pub prediction_frames: usize,
}

impl ChunkForward {
    /// Cheap sanity check so a layout mistake surfaces at the seam rather than
    /// as silently permuted speaker labels twenty frames later.
    pub(crate) fn validate(&self) -> Result<(), HostError> {
        if self.embeddings.len() != self.embedding_frames * EMB_DIM {
            return Err(HostError::BackendShape {
                what: "embedding values",
                got: self.embeddings.len(),
                want: self.embedding_frames * EMB_DIM,
            });
        }
        if self.predictions.len() != self.prediction_frames * NUM_SPEAKERS {
            return Err(HostError::BackendShape {
                what: "prediction values",
                got: self.predictions.len(),
                want: self.prediction_frames * NUM_SPEAKERS,
            });
        }
        Ok(())
    }
}

/// The neural forward pass, as the host state machine sees it.
///
/// Implementations are stateful only in the graph/allocator sense — all
/// diarization state (FIFO, speaker cache, silence profile) lives on the host
/// side, in [`super::SortformerHost`], and is passed in through
/// [`ChunkRequest`] on every call.
pub trait Backend {
    /// Run one streaming chunk.
    ///
    /// Errors are boxed so the trait does not impose an error type; the host
    /// wraps whatever comes back in [`HostError::Backend`].
    fn run_chunk(&mut self, request: ChunkRequest<'_>) -> Result<ChunkForward, Box<dyn std::error::Error + Send + Sync>>;
}

/// Blanket impl so a closure can stand in for a backend — handy in tests and
/// when the graph is still being wired up.
impl<F> Backend for F
where
    F: FnMut(ChunkRequest<'_>) -> Result<ChunkForward, Box<dyn std::error::Error + Send + Sync>>,
{
    fn run_chunk(&mut self, request: ChunkRequest<'_>) -> Result<ChunkForward, Box<dyn std::error::Error + Send + Sync>> {
        self(request)
    }
}
