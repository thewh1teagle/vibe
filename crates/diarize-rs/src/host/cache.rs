//! What one chunk does to the model's memory: the FIFO/speaker-cache update and
//! the cache compression that runs when the cache overflows.
//!
//! The other half of the AOSC state machine lives in [`super::aosc`], which owns
//! [`SortformerHost`] itself and drives the chunking; this file is the second
//! inherent `impl` block on that type. Split out of `aosc.rs` purely for size —
//! `aosc.rs` answers "how is a recording cut up and turned into segments", this
//! answers "what does one chunk do to what the model remembers".
//!
//! Ported from `parakeet-rs 0.3.x` `src/sortformer.rs` (MIT OR Apache-2.0,
//! Copyright (c) 2025 Enes Altun), which in turn tracks NVIDIA NeMo's
//! `nemo/collections/asr/modules/sortformer_modules.py`. The upstream function
//! names (`streaming_update`, `_compress_spkcache`, ...) are kept so the two can
//! be diffed. The full MIT notice is in [`super`].
//!
//! Reference: <https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2>

use ndarray::{s, Array2, Array3, Axis};

use super::aosc::SortformerHost;
use super::{
    Backend, ChunkForward, ChunkRequest, HostError, HostResult, EMB_DIM, MAX_INDEX, MIN_POS_SCORES_RATE, NUM_SPEAKERS, N_MELS,
    PRED_SCORE_THRESHOLD, SIL_THRESHOLD, SPKCACHE_SIL_FRAMES_PER_SPK, STRONG_BOOST_RATE, SUBSAMPLING, WEAK_BOOST_RATE,
};

impl SortformerHost {
    // -----------------------------------------------------------------------
    // The state machine proper
    // -----------------------------------------------------------------------

    /// NeMo's `streaming_update`, with smart cache compression.
    pub(super) fn streaming_update(
        &mut self,
        backend: &mut dyn Backend,
        chunk_feat: &Array3<f32>,
        current_len: usize,
    ) -> HostResult<Array2<f32>> {
        let spkcache_len = self.spkcache.shape()[1];
        let fifo_len = self.fifo.shape()[1];

        // The host DSP produces frame-major (1, T, D); the graph input is
        // mel-major. Transpose here rather than at the seam so the backend can
        // memcpy the buffer straight into its input tensor.
        let mel_frames = chunk_feat.shape()[1];
        let mut mel = Vec::with_capacity(N_MELS * mel_frames);
        for m in 0..N_MELS {
            for f in 0..mel_frames {
                mel.push(chunk_feat[[0, f, m]]);
            }
        }

        let spkcache = to_contiguous(&self.spkcache);
        let fifo = to_contiguous(&self.fifo);

        let forward = backend
            .run_chunk(ChunkRequest {
                mel: &mel,
                mel_frames,
                current_len,
                spkcache: &spkcache,
                spkcache_frames: spkcache_len,
                fifo: &fifo,
                fifo_frames: fifo_len,
            })
            .map_err(HostError::Backend)?;
        forward.validate()?;

        let ChunkForward {
            embeddings,
            embedding_frames,
            predictions,
            prediction_frames,
        } = forward;

        let preds = Array3::from_shape_vec((1, prediction_frames, NUM_SPEAKERS), predictions)
            .map_err(|e| HostError::Audio(format!("failed to reshape preds: {e}")))?;
        let new_embs = Array3::from_shape_vec((1, embedding_frames, EMB_DIM), embeddings)
            .map_err(|e| HostError::Audio(format!("failed to reshape embs: {e}")))?;

        // Valid model frames for this chunk, after the x8 subsampling.
        let chunk_len = current_len.div_ceil(SUBSAMPLING);

        // Extract predictions for the different parts of the concat.
        let fifo_preds = if fifo_len > 0 {
            preds.slice(s![0, spkcache_len..spkcache_len + fifo_len, ..]).to_owned()
        } else {
            Array2::zeros((0, NUM_SPEAKERS))
        };

        // Only keep chunk_len predictions/embeddings — right_context frames
        // participated in attention (providing lookahead) but are discarded here.
        let keep = self.geom.chunk_len.min(chunk_len);
        let chunk_preds = preds
            .slice(s![0, spkcache_len + fifo_len..spkcache_len + fifo_len + keep, ..])
            .to_owned();
        let chunk_embs = new_embs.slice(s![0, ..keep, ..]).to_owned();

        // Append chunk embeddings to the FIFO.
        self.fifo = Self::concat_axis1(&self.fifo, &chunk_embs.insert_axis(Axis(0)));

        // Update FIFO predictions.
        if fifo_len > 0 {
            let combined = Self::concat_axis1_2d(&fifo_preds, &chunk_preds);
            self.fifo_preds = combined.insert_axis(Axis(0));
        } else {
            self.fifo_preds = chunk_preds.clone().insert_axis(Axis(0));
        }

        let fifo_len_after = self.fifo.shape()[1];

        // Move from FIFO to cache when the FIFO exceeds its limit.
        if fifo_len_after > self.geom.fifo_len {
            let mut pop_out_len = self.geom.chunk_len;
            pop_out_len = pop_out_len.max(chunk_len.saturating_sub(self.geom.fifo_len) + fifo_len);
            pop_out_len = pop_out_len.min(fifo_len_after);

            let pop_out_embs = self.fifo.slice(s![.., ..pop_out_len, ..]).to_owned();
            let pop_out_preds = self.fifo_preds.slice(s![.., ..pop_out_len, ..]).to_owned();

            // Update the silence profile.
            self.update_silence_profile(&pop_out_embs, &pop_out_preds);

            // Remove from FIFO.
            self.fifo = self.fifo.slice(s![.., pop_out_len.., ..]).to_owned();
            self.fifo_preds = self.fifo_preds.slice(s![.., pop_out_len.., ..]).to_owned();

            // Append to cache.
            self.spkcache = Self::concat_axis1(&self.spkcache, &pop_out_embs);

            if let Some(ref cache_preds) = self.spkcache_preds {
                self.spkcache_preds = Some(Self::concat_axis1(cache_preds, &pop_out_preds));
            }

            // Smart compression when the cache exceeds its limit.
            if self.spkcache.shape()[1] > self.geom.spkcache_len {
                if self.spkcache_preds.is_none() {
                    // Initialize cache predictions from the first output — the
                    // cache prefix of the concat is the model's own read of the
                    // frames it has been carrying.
                    let initial_cache_preds = preds.slice(s![.., ..spkcache_len, ..]).to_owned();
                    let combined = Self::concat_axis1(&initial_cache_preds, &pop_out_preds);
                    self.spkcache_preds = Some(combined);
                }

                self.compress_spkcache();
            }
        }

        Ok(chunk_preds)
    }

    /// Update the mean silence embedding.
    ///
    /// A frame counts as silence when no speaker's probability sums past
    /// `SIL_THRESHOLD`. The running mean of those embeddings is what disabled
    /// cache slots get filled with during compression.
    fn update_silence_profile(&mut self, embs: &Array3<f32>, preds: &Array3<f32>) {
        let preds_2d = preds.slice(s![0, .., ..]);

        for t in 0..preds_2d.shape()[0] {
            let sum: f32 = (0..NUM_SPEAKERS).map(|s| preds_2d[[t, s]]).sum();
            if sum < SIL_THRESHOLD {
                // This is a silence frame.
                let emb = embs.slice(s![0, t, ..]);

                // Update the running mean.
                let old_sum: Vec<f32> = self
                    .mean_sil_emb
                    .slice(s![0, ..])
                    .iter()
                    .map(|&x| x * self.n_sil_frames as f32)
                    .collect();

                self.n_sil_frames += 1;

                for i in 0..EMB_DIM {
                    self.mean_sil_emb[[0, i]] = (old_sum[i] + emb[i]) / self.n_sil_frames as f32;
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Cache compression (NeMo `_compress_spkcache` and friends)
    // -----------------------------------------------------------------------

    /// Smart cache compression: score every cached frame per speaker, keep the
    /// most informative `spkcache_len` of them, fill the rest with silence.
    fn compress_spkcache(&mut self) {
        let cache_preds = match &self.spkcache_preds {
            Some(p) => p.clone(),
            None => return,
        };

        let n_frames = self.spkcache.shape()[1];
        let per_spk = self.geom.spkcache_len / NUM_SPEAKERS;
        if per_spk <= SPKCACHE_SIL_FRAMES_PER_SPK {
            // Truncate if the cache is too small for compression to mean anything.
            self.spkcache = self.spkcache.slice(s![.., ..self.geom.spkcache_len, ..]).to_owned();
            if let Some(ref p) = self.spkcache_preds {
                self.spkcache_preds = Some(p.slice(s![.., ..self.geom.spkcache_len, ..]).to_owned());
            }
            return;
        }
        let spkcache_len_per_spk = per_spk - SPKCACHE_SIL_FRAMES_PER_SPK;
        let strong_boost_per_spk = (spkcache_len_per_spk as f32 * STRONG_BOOST_RATE) as usize;
        let weak_boost_per_spk = (spkcache_len_per_spk as f32 * WEAK_BOOST_RATE) as usize;
        let min_pos_scores_per_spk = (spkcache_len_per_spk as f32 * MIN_POS_SCORES_RATE) as usize;

        // Quality scores.
        let preds_2d = cache_preds.slice(s![0, .., ..]).to_owned();
        let mut scores = self.get_log_pred_scores(&preds_2d);

        // Disable low scores.
        scores = self.disable_low_scores(&preds_2d, scores, min_pos_scores_per_spk);

        // Boost important frames.
        scores = self.boost_topk_scores(scores, strong_boost_per_spk, 2.0);
        scores = self.boost_topk_scores(scores, weak_boost_per_spk, 1.0);

        // Add the silence-frame placeholders. They score +inf so they are always
        // selected, and `get_topk_indices` then marks them disabled because
        // their frame index lands past the real frames.
        if SPKCACHE_SIL_FRAMES_PER_SPK > 0 {
            let mut padded = Array2::from_elem((n_frames + SPKCACHE_SIL_FRAMES_PER_SPK, NUM_SPEAKERS), f32::NEG_INFINITY);
            padded.slice_mut(s![..n_frames, ..]).assign(&scores);
            for i in n_frames..n_frames + SPKCACHE_SIL_FRAMES_PER_SPK {
                for j in 0..NUM_SPEAKERS {
                    padded[[i, j]] = f32::INFINITY;
                }
            }
            scores = padded;
        }

        // Select top frames.
        let (topk_indices, is_disabled) = self.get_topk_indices(&scores, n_frames);

        // Gather embeddings.
        let (new_embs, new_preds) = self.gather_spkcache(&topk_indices, &is_disabled);

        self.spkcache = new_embs;
        self.spkcache_preds = Some(new_preds);
    }

    /// Quality score per (frame, speaker): the log-odds of that speaker being
    /// active, plus the joint log-probability that nobody else is. Frames where
    /// exactly one speaker is confidently active score highest.
    fn get_log_pred_scores(&self, preds: &Array2<f32>) -> Array2<f32> {
        let mut scores = Array2::zeros(preds.dim());

        for t in 0..preds.shape()[0] {
            let mut log_1_probs_sum = 0.0f32;
            for s in 0..NUM_SPEAKERS {
                let p = preds[[t, s]].max(PRED_SCORE_THRESHOLD);
                let log_1_p = (1.0 - p).max(PRED_SCORE_THRESHOLD).ln();
                log_1_probs_sum += log_1_p;
            }

            for s in 0..NUM_SPEAKERS {
                let p = preds[[t, s]].max(PRED_SCORE_THRESHOLD);
                let log_p = p.ln();
                let log_1_p = (1.0 - p).max(PRED_SCORE_THRESHOLD).ln();
                scores[[t, s]] = log_p - log_1_p + log_1_probs_sum - 0.5f32.ln();
            }
        }

        scores
    }

    /// Disable non-speech and overlapped speech.
    ///
    /// A speaker's non-speech frames are always dropped. Its below-par frames
    /// are dropped too, but only once it already has `min_pos_scores_per_spk`
    /// good ones — a speaker with little material keeps what it has.
    fn disable_low_scores(&self, preds: &Array2<f32>, mut scores: Array2<f32>, min_pos_scores_per_spk: usize) -> Array2<f32> {
        // Count positive scores per speaker.
        let mut pos_count = [0usize; NUM_SPEAKERS];
        for t in 0..scores.shape()[0] {
            for s in 0..NUM_SPEAKERS {
                if scores[[t, s]] > 0.0 {
                    pos_count[s] += 1;
                }
            }
        }

        for t in 0..preds.shape()[0] {
            for s in 0..NUM_SPEAKERS {
                let is_speech = preds[[t, s]] > 0.5;

                if !is_speech {
                    scores[[t, s]] = f32::NEG_INFINITY;
                } else {
                    let is_pos = scores[[t, s]] > 0.0;
                    if !is_pos && pos_count[s] >= min_pos_scores_per_spk {
                        scores[[t, s]] = f32::NEG_INFINITY;
                    }
                }
            }
        }

        scores
    }

    /// Boost the top K frames per speaker so each speaker gets a guaranteed
    /// share of the cache regardless of how the global ranking falls out.
    fn boost_topk_scores(&self, mut scores: Array2<f32>, n_boost_per_spk: usize, scale_factor: f32) -> Array2<f32> {
        for s in 0..NUM_SPEAKERS {
            // Get the column for this speaker.
            let col: Vec<(usize, f32)> = (0..scores.shape()[0]).map(|t| (t, scores[[t, s]])).collect();

            // Sort by score descending, ties by ascending frame index — the
            // same order ATen's CPU topk returns (see `get_topk_indices`).
            let mut sorted = col.clone();
            sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0)));

            // Boost the top K.
            for item in sorted.iter().take(n_boost_per_spk.min(sorted.len())) {
                let t = item.0;
                if scores[[t, s]] != f32::NEG_INFINITY {
                    scores[[t, s]] -= scale_factor * 0.5f32.ln();
                }
            }
        }

        scores
    }

    /// Pick which cached frames survive: NeMo flattens the `(S, T)` score matrix
    /// and takes a global top-`spkcache_len`.
    ///
    /// **The tie-break here is load-bearing.** NeMo runs `torch.topk` on CPU,
    /// whose ATen kernel breaks ties by ascending flat index; because the flat
    /// index is `speaker * n_frames + time`, that is ascending frame index
    /// within a speaker. Scores tie constantly — every frame a speaker is silent
    /// in gets the identical `-inf`, and the boosts add a constant — so a
    /// different tie-break selects a different set of frames, which changes what
    /// the cache remembers about each speaker and ultimately permutes the
    /// speaker labels. The comparator below spells the order out rather than
    /// leaning on `sort_by` being stable.
    fn get_topk_indices(&self, scores: &Array2<f32>, n_frames_no_sil: usize) -> (Vec<usize>, Vec<bool>) {
        let n_frames = scores.shape()[0];

        // Flatten scores as (S, T) then reshape to (S*T,).
        // This means we iterate: speaker 0 all times, then speaker 1 all times, etc.
        // flat_index = speaker * n_frames + time
        let mut flat_scores: Vec<(usize, f32)> = Vec::with_capacity(n_frames * NUM_SPEAKERS);
        for s in 0..NUM_SPEAKERS {
            for t in 0..n_frames {
                let flat_idx = s * n_frames + t;
                flat_scores.push((flat_idx, scores[[t, s]]));
            }
        }

        // Value descending, flat index ascending on ties.
        flat_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0)));

        // Take the top spkcache_len and replace invalid scores with MAX_INDEX.
        let mut topk_flat: Vec<usize> = flat_scores
            .iter()
            .take(self.geom.spkcache_len)
            .map(|(idx, score)| if *score == f32::NEG_INFINITY { MAX_INDEX } else { *idx })
            .collect();

        // Sort the flat indices ascending (this puts MAX_INDEX at the end), so
        // the rebuilt cache stays in arrival order — the "AO" of AOSC.
        topk_flat.sort();

        // Compute is_disabled and convert to frame indices.
        let mut is_disabled = vec![false; self.geom.spkcache_len];
        let mut frame_indices = vec![0usize; self.geom.spkcache_len];

        for (i, &flat_idx) in topk_flat.iter().enumerate() {
            if flat_idx == MAX_INDEX {
                // Invalid entries are disabled.
                is_disabled[i] = true;
                frame_indices[i] = 0; // Disabled slots index 0.
            } else {
                // Convert to a frame index.
                let frame_idx = flat_idx % n_frames;

                // Check if the frame is beyond the valid range — this is how the
                // +inf silence placeholders end up disabled.
                if frame_idx >= n_frames_no_sil {
                    is_disabled[i] = true;
                    frame_indices[i] = 0; // Same as above: disabled slots index 0.
                } else {
                    frame_indices[i] = frame_idx;
                }
            }
        }

        (frame_indices, is_disabled)
    }

    /// Gather the selected frames into a fresh cache, filling disabled slots
    /// with the mean silence embedding and zero predictions.
    fn gather_spkcache(&self, indices: &[usize], is_disabled: &[bool]) -> (Array3<f32>, Array3<f32>) {
        let mut new_embs = Array3::zeros((1, self.geom.spkcache_len, EMB_DIM));
        let mut new_preds = Array3::zeros((1, self.geom.spkcache_len, NUM_SPEAKERS));

        let cache_preds = self.spkcache_preds.as_ref().unwrap();

        for (i, (&idx, &disabled)) in indices.iter().zip(is_disabled.iter()).enumerate() {
            if i >= self.geom.spkcache_len {
                break;
            }

            if disabled {
                // Use the silence embedding.
                new_embs.slice_mut(s![0, i, ..]).assign(&self.mean_sil_emb.slice(s![0, ..]));
                // Predictions stay zero.
            } else if idx < self.spkcache.shape()[1] {
                new_embs.slice_mut(s![0, i, ..]).assign(&self.spkcache.slice(s![0, idx, ..]));
                new_preds.slice_mut(s![0, i, ..]).assign(&cache_preds.slice(s![0, idx, ..]));
            }
        }

        (new_embs, new_preds)
    }

    // -----------------------------------------------------------------------
    // Small array helpers
    // -----------------------------------------------------------------------

    /// Concatenate along axis 1 for 3D arrays.
    fn concat_axis1(a: &Array3<f32>, b: &Array3<f32>) -> Array3<f32> {
        if a.shape()[1] == 0 {
            return b.clone();
        }
        if b.shape()[1] == 0 {
            return a.clone();
        }
        ndarray::concatenate(Axis(1), &[a.view(), b.view()]).unwrap()
    }

    /// Concatenate along axis 0 for 2D arrays.
    fn concat_axis1_2d(a: &Array2<f32>, b: &Array2<f32>) -> Array2<f32> {
        if a.shape()[0] == 0 {
            return b.clone();
        }
        if b.shape()[0] == 0 {
            return a.clone();
        }
        ndarray::concatenate(Axis(0), &[a.view(), b.view()]).unwrap()
    }
}

/// Flatten a `(1, T, D)` state array to a row-major slice for the backend.
fn to_contiguous(array: &Array3<f32>) -> Vec<f32> {
    array.iter().copied().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::{DiarizationConfig, MelFrontend, StreamGeometry, HOP_LENGTH, SAMPLE_RATE};

    type BoxErr = Box<dyn std::error::Error + Send + Sync>;

    /// A backend that fabricates a single confident speaker, so the host side
    /// can be driven without a model file. Also checks the seam's own
    /// invariants: mel arrives mel-major and the cache slices are sized.
    fn stub_backend(request: ChunkRequest<'_>) -> Result<ChunkForward, BoxErr> {
        assert_eq!(request.mel.len(), N_MELS * request.mel_frames);
        assert_eq!(request.spkcache.len(), request.spkcache_frames * EMB_DIM);
        assert_eq!(request.fifo.len(), request.fifo_frames * EMB_DIM);

        let chunk_frames = request.mel_frames / SUBSAMPLING;
        let prediction_frames = request.spkcache_frames + request.fifo_frames + chunk_frames;

        let mut predictions = vec![0.01f32; prediction_frames * NUM_SPEAKERS];
        for t in 0..prediction_frames {
            predictions[t * NUM_SPEAKERS] = 0.9;
        }

        // Embeddings only need to be distinguishable per frame for the cache
        // bookkeeping to be meaningful.
        let mut embeddings = vec![0.0f32; chunk_frames * EMB_DIM];
        for (i, value) in embeddings.iter_mut().enumerate() {
            *value = (i % 97) as f32 / 97.0;
        }

        Ok(ChunkForward {
            embeddings,
            embedding_frames: chunk_frames,
            predictions,
            prediction_frames,
        })
    }

    #[test]
    fn streaming_fills_and_compresses_the_speaker_cache() {
        let geom = StreamGeometry::default();
        let mut host = SortformerHost::new(MelFrontend::computed(), geom, DiarizationConfig::callhome());

        // Three chunks' worth: the FIFO overflows on the second and the speaker
        // cache overflows (and so compresses) on the third.
        let chunk_samples = geom.chunk_len * SUBSAMPLING * HOP_LENGTH;
        let audio = vec![0.0f32; chunk_samples * 3];

        let mut backend = stub_backend;
        let segments = host.diarize(&mut backend, audio, SAMPLE_RATE as u32, 1).unwrap();

        assert_eq!(
            host.spkcache.shape()[1],
            geom.spkcache_len,
            "cache should be compressed back to exactly spkcache_len"
        );
        assert!(!segments.is_empty());
        assert!(segments.iter().all(|s| s.speaker_id == 0));
    }
}
