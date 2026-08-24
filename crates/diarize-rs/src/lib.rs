//! Speaker diarization with NVIDIA Sortformer.
//!
//! Everything runs in-process against a GGUF exported from the original NeMo
//! checkpoint (see `scripts/README.md`): the `sf_*` modules are the ggml graph,
//! `host/` is the mel frontend plus the AOSC speaker-cache state machine, and
//! `sf_backend` is the seam between them. There is no ONNX Runtime here.

mod host;
mod sf_backend;
mod sf_gguf;
mod sf_graph;
mod sf_ops;
mod sf_runtime;
mod sf_transformer;
pub mod sf_weights;

pub use sf_graph::{run_chunk, run_chunk_stages, run_chunk_valid, ChunkOutput, Stage};

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use host::{DiarizationConfig, MelFrontend, SortformerHost, StreamGeometry};
use sf_backend::GgmlBackend;
use sf_weights::SortformerWeights;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("failed to initialize diarizer from {path}: {source}")]
    Init {
        path: PathBuf,
        source: Box<dyn std::error::Error + Send + Sync>,
    },
    #[error("diarization failed: {0}")]
    Diarize(Box<dyn std::error::Error + Send + Sync>),
}

pub struct Diarizer {
    host: SortformerHost,
    backend: GgmlBackend,
}

impl Diarizer {
    /// Load a Sortformer GGUF.
    pub fn new(model_path: impl AsRef<Path>) -> Result<Self> {
        let path = model_path.as_ref();
        let init = |source: Box<dyn std::error::Error + Send + Sync>| Error::Init {
            path: path.to_path_buf(),
            source,
        };

        let weights = SortformerWeights::load(path).map_err(|e| init(Box::new(e)))?;

        // Use the filterbank the checkpoint ships rather than recomputing one.
        // NeMo built `preprocessor.fb` with torchaudio; librosa's triangles and
        // Slaney normalisation differ in the last few ulps, and the log at the
        // end of the frontend keeps those differences visible.
        let filterbank = weights.mel_filterbank().map_err(|e| init(Box::new(e)))?;
        let mel = MelFrontend::from_trained_filterbank(&filterbank).map_err(|e| init(Box::new(e)))?;

        // Streaming geometry: these are the *inference-time* values, and they
        // are deliberately NOT read from the GGUF's `sortformer.streaming.*`
        // KVs. Those record the training-time configuration (chunk 188 / fifo 0
        // / spkcache 188) and would change the shape of every chunk. The ONNX
        // export carried the inference values in `metadata_props`
        // (chunk_len=124, fifo_len=124, spkcache_len=188), which is what the
        // recorded baseline in `baseline/` was produced with, and what
        // NVIDIA's published streaming configuration for v2 uses.
        // `right_context = 1` appears in neither file — it is a host-side
        // assumption inherited from parakeet-rs, reproduced here on purpose.
        let geom = StreamGeometry {
            chunk_len: 124,
            fifo_len: 124,
            spkcache_len: 188,
            right_context: 1,
        };

        Ok(Self {
            host: SortformerHost::new(mel, geom, DiarizationConfig::callhome()),
            backend: GgmlBackend::new(weights),
        })
    }

    pub fn diarize(&mut self, samples: &[f32], sample_rate: u32, channels: u16) -> Result<Vec<Segment>> {
        let speaker_segments = self
            .host
            .diarize(&mut self.backend, samples.to_vec(), sample_rate, channels)
            .map_err(|source| Error::Diarize(Box::new(source)))?;

        Ok(speaker_segments
            .into_iter()
            .map(|segment| Segment {
                start: segment.start as f64 / 16_000.0,
                end: segment.end as f64 / 16_000.0,
                speaker_id: segment.speaker_id,
            })
            .collect())
    }

    /// The raw `[T, 4]` speaker-probability matrix, before median filtering and
    /// binarisation. This is the artifact the `baseline/probs/` oracle records,
    /// so validation compares against it rather than against segments.
    #[doc(hidden)]
    pub fn diarize_raw(&mut self, samples: &[f32], sample_rate: u32, channels: u16) -> Result<(Vec<f32>, usize)> {
        self.host
            .diarize_raw(&mut self.backend, samples, sample_rate, channels)
            .map_err(|source| Error::Diarize(Box::new(source)))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub speaker_id: usize,
}
