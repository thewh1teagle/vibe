//! The AOSC (Arrival-Order Speaker Cache) streaming state machine: the caller's
//! entry points, and the chunking and windowing behind them.
//!
//! What each chunk then does to the model's memory — the FIFO/speaker-cache
//! update and the cache compression — lives in [`super::cache`], as a second
//! inherent `impl` block on [`SortformerHost`].
//!
//! Ported from `parakeet-rs 0.3.x` `src/sortformer.rs` (MIT OR Apache-2.0,
//! Copyright (c) 2025 Enes Altun), which in turn tracks NVIDIA NeMo's
//! `nemo/collections/asr/modules/sortformer_modules.py`. The upstream function
//! names are kept so the two can be diffed.
//!
//! The shape of it: audio is cut into `chunk_len + right_context` mel windows.
//! Each window goes through the neural graph together with the current speaker
//! cache and FIFO, which act as the model's memory. Chunk embeddings are pushed
//! into the FIFO; when the FIFO overflows, the oldest frames are popped into the
//! speaker cache; when *that* overflows, the cache is compressed by scoring
//! every cached frame per speaker and keeping the most informative ones. The
//! compression is the exactness-critical part — see `get_topk_indices` in
//! [`super::cache`].
//!
//! Reference: <https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2>

use ndarray::{s, Array2, Array3, Axis};

use super::segment::{binarize, median_filter};
use super::{
    Backend, DiarizationConfig, HostError, HostResult, MelFrontend, SpeakerSegment, CHUNK_LEN, EMB_DIM, FIFO_LEN, FRAME_DURATION,
    HOP_LENGTH, NUM_SPEAKERS, N_MELS, RIGHT_CONTEXT, SAMPLE_RATE, SPKCACHE_LEN, SUBSAMPLING,
};

/// Streaming geometry, in model frames.
///
/// The upstream crate read these off ONNX metadata with the module constants as
/// fallback; with a GGUF they come from the hyper-parameter KVs instead, so this
/// stays constructible from outside.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StreamGeometry {
    /// Frames emitted per chunk (~10 s at 80 ms each).
    pub chunk_len: usize,
    /// FIFO buffer length.
    pub fifo_len: usize,
    /// Speaker cache length.
    pub spkcache_len: usize,
    /// Lookahead frames: attended to, then discarded from the output.
    pub right_context: usize,
}

impl Default for StreamGeometry {
    fn default() -> Self {
        Self {
            chunk_len: CHUNK_LEN,
            fifo_len: FIFO_LEN,
            spkcache_len: SPKCACHE_LEN,
            right_context: RIGHT_CONTEXT,
        }
    }
}

/// The host half of Streaming Sortformer v2: mel frontend, chunking, the
/// speaker-cache state machine, and post-processing.
///
/// The neural forward pass is supplied per call as a [`Backend`], so this type
/// holds no model and no inference library.
pub struct SortformerHost {
    config: DiarizationConfig,
    mel: MelFrontend,
    // `pub(super)` from here down: the per-chunk memory update in `super::cache`
    // is a second `impl` block on this type and reads/writes these directly.
    pub(super) geom: StreamGeometry,

    // Streaming state, laid out the same way as NeMo.
    pub(super) spkcache: Array3<f32>,               // (1, 0..spkcache_len, EMB_DIM)
    pub(super) spkcache_preds: Option<Array3<f32>>, // (1, 0..spkcache_len, NUM_SPEAKERS)
    pub(super) fifo: Array3<f32>,                   // (1, 0..fifo_len, EMB_DIM)
    pub(super) fifo_preds: Array3<f32>,             // (1, 0..fifo_len, NUM_SPEAKERS)
    pub(super) mean_sil_emb: Array2<f32>,           // (1, EMB_DIM)
    pub(super) n_sil_frames: usize,

    // Buffered streaming state (used by feed/flush).
    audio_buffer: Vec<f32>,
    elapsed_samples: usize,
}

impl SortformerHost {
    pub fn new(mel: MelFrontend, geom: StreamGeometry, config: DiarizationConfig) -> Self {
        let mut instance = Self {
            config,
            mel,
            geom,
            spkcache: Array3::zeros((1, 0, EMB_DIM)),
            spkcache_preds: None,
            fifo: Array3::zeros((1, 0, EMB_DIM)),
            fifo_preds: Array3::zeros((1, 0, NUM_SPEAKERS)),
            mean_sil_emb: Array2::zeros((1, EMB_DIM)),
            n_sil_frames: 0,
            audio_buffer: Vec::new(),
            elapsed_samples: 0,
        };
        instance.reset_state();
        instance
    }

    pub fn config(&self) -> &DiarizationConfig {
        &self.config
    }

    pub fn geometry(&self) -> StreamGeometry {
        self.geom
    }

    /// Streaming latency in seconds: `(chunk_len + right_context) * 80ms`.
    /// e.g. chunk_len=124, right_context=1 -> 10.0s
    pub fn latency(&self) -> f32 {
        (self.geom.chunk_len + self.geom.right_context) as f32 * FRAME_DURATION
    }

    /// Reset streaming state.
    pub fn reset_state(&mut self) {
        self.spkcache = Array3::zeros((1, 0, EMB_DIM));
        self.spkcache_preds = None;
        self.fifo = Array3::zeros((1, 0, EMB_DIM));
        self.fifo_preds = Array3::zeros((1, 0, NUM_SPEAKERS));
        self.mean_sil_emb = Array2::zeros((1, EMB_DIM));
        self.n_sil_frames = 0;
        self.audio_buffer.clear();
        self.elapsed_samples = 0;
    }

    // -----------------------------------------------------------------------
    // Entry points
    // -----------------------------------------------------------------------

    /// Main diarization entry point: one complete recording, start to finish.
    pub fn diarize(
        &mut self,
        backend: &mut dyn Backend,
        mut audio: Vec<f32>,
        sample_rate: u32,
        channels: u16,
    ) -> HostResult<Vec<SpeakerSegment>> {
        if sample_rate != SAMPLE_RATE as u32 {
            return Err(HostError::Audio(format!("Expected {SAMPLE_RATE} Hz, got {sample_rate} Hz")));
        }

        // Downmix to mono.
        if channels > 1 {
            audio = audio
                .chunks(channels as usize)
                .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                .collect();
        }

        // Reset state for new audio.
        self.reset_state();

        let features = self.mel.extract_mel_features(&audio)?;
        let full_preds = self.process_features(backend, &features)?;

        let filtered_preds = if self.config.median_window > 1 {
            median_filter(&self.config, &full_preds)
        } else {
            full_preds
        };

        // Binarize to segments and clip to audio length.
        let n_audio_samples = audio.len() as u64;
        let mut segments = binarize(&self.config, &filtered_preds);
        for seg in &mut segments {
            seg.end = seg.end.min(n_audio_samples);
        }
        segments.retain(|s| s.end > s.start);

        Ok(segments)
    }

    /// The raw sigmoid matrix, row-major `[T, NUM_SPEAKERS]`, before median
    /// filtering and binarisation.
    ///
    /// The equivalent of the upstream `diarize_chunk_raw`, which is what
    /// `baseline/probs/` was recorded from. Kept because it is the last purely
    /// numerical artifact of the graph, and so the right thing to diff a port
    /// against; the segments after it depend on post-processing thresholds.
    pub fn diarize_raw(
        &mut self,
        backend: &mut dyn Backend,
        audio: &[f32],
        sample_rate: u32,
        channels: u16,
    ) -> HostResult<(Vec<f32>, usize)> {
        if sample_rate != SAMPLE_RATE as u32 {
            return Err(HostError::Audio(format!("Expected {SAMPLE_RATE} Hz, got {sample_rate} Hz")));
        }
        let mono: Vec<f32> = if channels > 1 {
            audio
                .chunks(channels as usize)
                .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                .collect()
        } else {
            audio.to_vec()
        };

        self.reset_state();
        let features = self.mel.extract_mel_features(&mono)?;
        let preds = self.process_features(backend, &features)?;
        let frames = preds.shape()[0];
        Ok((preds.iter().copied().collect(), frames))
    }

    /// Streaming diarization: process one audio chunk without resetting state.
    ///
    /// Unlike [`SortformerHost::diarize`], this preserves internal state (FIFO,
    /// speaker cache, silence profile) across calls, enabling true streaming.
    ///
    /// For the full `right_context` benefit, buffer at least
    /// `(chunk_len + right_context) * 80ms` of audio before each call, then
    /// stride by `chunk_len * 80ms`. Shorter buffers still work (padded with
    /// zeros) but the lookahead sees silence instead of real future audio.
    ///
    /// Returns segments with sample offsets relative to this chunk (from 0).
    pub fn diarize_chunk(&mut self, backend: &mut dyn Backend, audio_16k_mono: &[f32]) -> HostResult<Vec<SpeakerSegment>> {
        if audio_16k_mono.is_empty() {
            return Ok(vec![]);
        }

        let features = self.mel.extract_mel_features(audio_16k_mono)?;
        let full_preds = self.process_features(backend, &features)?;

        let filtered_preds = if self.config.median_window > 1 {
            median_filter(&self.config, &full_preds)
        } else {
            full_preds
        };

        // Clip to audio length in samples.
        let n_audio_samples = audio_16k_mono.len() as u64;
        let mut segments = binarize(&self.config, &filtered_preds);
        for seg in &mut segments {
            seg.end = seg.end.min(n_audio_samples);
        }
        segments.retain(|s| s.end > s.start);

        Ok(segments)
    }

    /// Feed audio samples for buffered streaming diarization.
    ///
    /// Buffers audio internally and runs inference only when enough has
    /// accumulated for a full `(chunk_len + right_context)` window. Returns
    /// segments with **absolute** timestamps (accumulated across calls).
    ///
    /// Each successful inference produces `chunk_len * 80ms` worth of
    /// predictions from exactly one `streaming_update` call — no redundant
    /// re-chunking.
    pub fn feed(&mut self, backend: &mut dyn Backend, audio_16k_mono: &[f32]) -> HostResult<Vec<SpeakerSegment>> {
        self.audio_buffer.extend_from_slice(audio_16k_mono);

        let feed_size = (self.geom.chunk_len + self.geom.right_context) * SUBSAMPLING;
        let stride_samples = self.geom.chunk_len * SUBSAMPLING * HOP_LENGTH;
        let feed_samples = (self.geom.chunk_len + self.geom.right_context) * SUBSAMPLING * HOP_LENGTH;

        let mut all_segments = Vec::new();

        while self.audio_buffer.len() >= feed_samples {
            let window = &self.audio_buffer[..feed_samples];
            let features = self.mel.extract_mel_features(window)?;
            // STFT center=True produces feed_size+1 mel frames from feed_samples
            // of audio, so there are always enough frames: just slice to feed_size.
            let chunk_feat = features.slice(s![.., ..feed_size, ..]).to_owned();
            let current_len = feed_size;

            let chunk_preds = self.streaming_update(backend, &chunk_feat, current_len)?;

            let filtered_preds = if self.config.median_window > 1 {
                median_filter(&self.config, &chunk_preds)
            } else {
                chunk_preds
            };

            // Binarize with absolute sample offset.
            let sample_offset = self.elapsed_samples as u64;
            let chunk_samples = (self.geom.chunk_len * SUBSAMPLING * HOP_LENGTH) as u64;
            let mut segments = binarize(&self.config, &filtered_preds);
            for seg in &mut segments {
                seg.start += sample_offset;
                seg.end = (seg.end + sample_offset).min(sample_offset + chunk_samples);
            }
            segments.retain(|s| s.end > s.start);
            all_segments.extend(segments);

            // Advance: stride by chunk_len, keep the right_context overlap.
            self.audio_buffer.drain(..stride_samples);
            self.elapsed_samples += stride_samples;
        }

        Ok(all_segments)
    }

    /// Flush remaining buffered audio at end of stream.
    ///
    /// Processes any leftover audio in the buffer with zero padding. Call once
    /// when the audio stream ends, to get the final segments.
    pub fn flush(&mut self, backend: &mut dyn Backend) -> HostResult<Vec<SpeakerSegment>> {
        if self.audio_buffer.is_empty() {
            return Ok(vec![]);
        }

        let feed_size = (self.geom.chunk_len + self.geom.right_context) * SUBSAMPLING;
        let remaining = std::mem::take(&mut self.audio_buffer);

        let features = self.mel.extract_mel_features(&remaining)?;
        let total_mel = features.shape()[1];
        let current_len = total_mel.min(feed_size);

        let chunk_feat = if current_len < feed_size {
            let mut padded = Array3::zeros((1, feed_size, N_MELS));
            padded
                .slice_mut(s![.., ..current_len, ..])
                .assign(&features.slice(s![.., ..current_len, ..]));
            padded
        } else {
            features.slice(s![.., ..feed_size, ..]).to_owned()
        };

        let chunk_preds = self.streaming_update(backend, &chunk_feat, current_len)?;

        let filtered_preds = if self.config.median_window > 1 {
            median_filter(&self.config, &chunk_preds)
        } else {
            chunk_preds
        };

        let sample_offset = self.elapsed_samples as u64;
        let remaining_samples = remaining.len() as u64;
        let mut segments = binarize(&self.config, &filtered_preds);
        for seg in &mut segments {
            seg.start += sample_offset;
            seg.end = (seg.end + sample_offset).min(sample_offset + remaining_samples);
        }
        segments.retain(|s| s.end > s.start);

        self.elapsed_samples += remaining.len();

        Ok(segments)
    }

    // -----------------------------------------------------------------------
    // Chunking
    // -----------------------------------------------------------------------

    /// Run streaming inference over mel features, returning the concatenated
    /// per-chunk predictions.
    ///
    /// Shared by `diarize` and `diarize_chunk`.
    fn process_features(&mut self, backend: &mut dyn Backend, features: &Array3<f32>) -> HostResult<Array2<f32>> {
        let total_frames = features.shape()[1];
        let chunk_stride = self.geom.chunk_len * SUBSAMPLING;
        let feed_size = (self.geom.chunk_len + self.geom.right_context) * SUBSAMPLING;
        let num_chunks = total_frames.div_ceil(chunk_stride);

        let mut all_chunk_preds = Vec::new();

        for chunk_idx in 0..num_chunks {
            let start = chunk_idx * chunk_stride;
            let end = (start + feed_size).min(total_frames);
            let current_len = end - start;

            let mut chunk_feat = features.slice(s![.., start..end, ..]).to_owned();

            if current_len < feed_size {
                let mut padded = Array3::zeros((1, feed_size, N_MELS));
                padded.slice_mut(s![.., ..current_len, ..]).assign(&chunk_feat);
                chunk_feat = padded;
            }

            let chunk_preds = self.streaming_update(backend, &chunk_feat, current_len)?;
            all_chunk_preds.push(chunk_preds);
        }

        Ok(Self::concat_predictions(&all_chunk_preds))
    }

    /// Concatenate per-chunk predictions along time.
    fn concat_predictions(preds: &[Array2<f32>]) -> Array2<f32> {
        if preds.is_empty() {
            return Array2::zeros((0, NUM_SPEAKERS));
        }
        if preds.len() == 1 {
            return preds[0].clone();
        }

        let views: Vec<_> = preds.iter().map(|p| p.view()).collect();
        ndarray::concatenate(Axis(0), &views).unwrap()
    }
}
