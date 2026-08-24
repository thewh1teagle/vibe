//! The adapter that plugs the ggml graph into the host state machine.
//!
//! [`super::host::Backend`] is deliberately narrow: mel in, embeddings and
//! speaker probabilities out. `sf_graph::run_chunk` already returns exactly the
//! pair NeMo calls `chunk_pre_encode_embs` / `spkcache_fifo_chunk_preds`, so
//! all this type does is the one structural thing the graph asks of its caller:
//! hand it the `[spkcache | fifo]` prefix as a single contiguous buffer.

use crate::host::{Backend, ChunkForward, ChunkRequest};
use crate::sf_graph::run_chunk_valid;
use crate::sf_weights::SortformerWeights;

type BoxErr = Box<dyn std::error::Error + Send + Sync>;

/// A [`Backend`] backed by a GGUF Sortformer and the ggml graph.
pub(crate) struct GgmlBackend {
    weights: SortformerWeights,
    /// Reused across chunks so the concat does not reallocate every 10 s.
    cache: Vec<f32>,
}

impl GgmlBackend {
    pub(crate) fn new(weights: SortformerWeights) -> Self {
        Self {
            weights,
            cache: Vec::new(),
        }
    }
}

impl Backend for GgmlBackend {
    fn run_chunk(&mut self, request: ChunkRequest<'_>) -> Result<ChunkForward, BoxErr> {
        // Order matters: the graph builds the rel-pos table and the attention
        // over `[spkcache | fifo | chunk]` in that order, and the host slices
        // the returned predictions back out at `spkcache_len` and
        // `spkcache_len + fifo_len`. Swapping the two halves would silently
        // mis-attribute every cached frame.
        self.cache.clear();
        self.cache.reserve(request.spkcache.len() + request.fifo.len());
        self.cache.extend_from_slice(request.spkcache);
        self.cache.extend_from_slice(request.fifo);

        // `request.mel` is already mel-major (`mel[m * mel_frames + f]`), which
        // is the layout the ggml `[frames, n_mels]` input tensor consumes
        // verbatim — the host transposed on its side. `current_len` is the
        // unpadded frame count, ONNX's `chunk_lengths`; the graph needs it so
        // the zero-padded tail of the last window does not become a token every
        // real frame attends to.
        let out = run_chunk_valid(
            &self.weights,
            request.mel,
            request.mel_frames,
            request.current_len,
            &self.cache,
        )?;

        Ok(ChunkForward {
            embeddings: out.embeddings,
            embedding_frames: out.embedding_frames,
            predictions: out.predictions,
            prediction_frames: out.prediction_frames,
        })
    }
}
