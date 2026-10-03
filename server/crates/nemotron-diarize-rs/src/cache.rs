//! Arrival-Order Speaker Cache and FIFO queue, a host-side port of
//! `Nemotron3DiarizationSpeakerCache` for one stream.
//!
//! All buffers are row-major: embeddings `[frames, hidden]`, probabilities `[frames, speakers]`.

use std::time::Instant;

use crate::model::HParams;

pub(crate) struct SpeakerCache {
    hidden: usize,
    speakers: usize,
    factor: usize,
    fifo_length: usize,
    update_period: usize,
    cache_length: usize,
    silence_frames: usize,
    score_threshold: f32,
    latest_boost: f32,
    min_positive_scores: usize,
    strong_boosted: usize,
    weak_boosted: usize,

    embeds: Vec<f32>,
    probs: Vec<f32>,
    fifo: Vec<f32>,
    is_compressed: bool,
    pub compressions: usize,
}

impl SpeakerCache {
    /// The offline sizes: FIFO length and update period from the top-level config.
    pub fn offline(h: &HParams) -> Self {
        let budget = (h.cache_length / h.num_speakers).saturating_sub(h.cache_silence_frames) as f32;
        Self {
            hidden: h.hidden_size,
            speakers: h.num_speakers,
            factor: h.subsampling_factor,
            fifo_length: h.fifo_length,
            update_period: h.speaker_cache_update_period,
            cache_length: h.cache_length,
            silence_frames: h.cache_silence_frames,
            score_threshold: h.prediction_score_threshold,
            latest_boost: h.latest_frames_score_boost,
            min_positive_scores: (budget * h.min_positive_scores_rate).floor() as usize,
            strong_boosted: (budget * h.strong_boost_rate).floor() as usize,
            weak_boosted: (budget * h.weak_boost_rate).floor() as usize,
            embeds: Vec::new(),
            probs: Vec::new(),
            fifo: Vec::new(),
            is_compressed: false,
            compressions: 0,
        }
    }

    pub fn num_cache_frames(&self) -> usize {
        self.embeds.len() / self.hidden
    }

    pub fn num_fifo_frames(&self) -> usize {
        self.fifo.len() / self.hidden
    }

    /// Cached frames then FIFO frames, the prefix every step attends to.
    pub fn prefix(&self) -> impl Iterator<Item = &f32> {
        self.embeds.iter().chain(self.fifo.iter())
    }

    /// Pushes a processed step: its chunk frames join the FIFO, whose overflow moves to the cache.
    ///
    /// `step_embeds` is the step input `[cache | fifo | chunk | look-ahead]`, `logits` its
    /// `[frames * factor, speakers]` output, `valid` its frame mask.
    pub fn update(&mut self, step_embeds: &[f32], logits: &[f32], valid: &[bool], silence: &[f32], num_chunk_frames: usize) {
        let (hidden, speakers) = (self.hidden, self.speakers);
        let probs = self.pool_probs(logits, valid);
        let num_cache = self.num_cache_frames();
        let num_fifo = self.num_fifo_frames();

        let chunk_start = num_cache + num_fifo;
        let mut fifo = std::mem::take(&mut self.fifo);
        fifo.extend_from_slice(&step_embeds[chunk_start * hidden..(chunk_start + num_chunk_frames) * hidden]);
        let fifo_frames = fifo.len() / hidden;

        let popped = self.num_popped_frames(fifo_frames);
        if popped > 0 {
            // An uncompressed cache holds plain chunk frames, whose probabilities this step re-estimates;
            // a compressed one is out of order, so only its stored probabilities apply.
            let mut cache_probs = if self.is_compressed {
                std::mem::take(&mut self.probs)
            } else {
                probs[..num_cache * speakers].to_vec()
            };
            cache_probs.extend_from_slice(&probs[num_cache * speakers..(num_cache + popped) * speakers]);
            let mut cache_embeds = std::mem::take(&mut self.embeds);
            cache_embeds.extend_from_slice(&fifo[..popped * hidden]);
            fifo.drain(..popped * hidden);

            if cache_embeds.len() / hidden > self.cache_length {
                let started = Instant::now();
                let before = cache_embeds.len() / hidden;
                (cache_embeds, cache_probs) = self.compress(&cache_embeds, &cache_probs, silence);
                self.is_compressed = true;
                self.compressions += 1;
                tracing::trace!(
                    before,
                    after = cache_embeds.len() / hidden,
                    us = started.elapsed().as_secs_f64() * 1e6,
                    "speaker cache compressed"
                );
            }
            self.embeds = cache_embeds;
            self.probs = cache_probs;
        }
        tracing::trace!(
            popped,
            cache = self.num_cache_frames(),
            fifo = fifo.len() / hidden,
            "speaker cache updated"
        );
        self.fifo = fifo;
    }

    /// `sigmoid(logits)` average-pooled to the encoder frame rate, zeroed on padding frames.
    fn pool_probs(&self, logits: &[f32], valid: &[bool]) -> Vec<f32> {
        let (speakers, factor) = (self.speakers, self.factor);
        let frames = logits.len() / (speakers * factor);
        let mut probs = vec![0.0f32; frames * speakers];
        for frame in 0..frames {
            if !valid[frame] {
                continue;
            }
            for sub in 0..factor {
                let row = &logits[(frame * factor + sub) * speakers..][..speakers];
                for (s, &logit) in row.iter().enumerate() {
                    probs[frame * speakers + s] += sigmoid(logit);
                }
            }
            for p in &mut probs[frame * speakers..(frame + 1) * speakers] {
                *p /= factor as f32;
            }
        }
        probs
    }

    /// Nothing moves until the FIFO overflows; then at least `update_period` oldest frames do.
    fn num_popped_frames(&self, fifo_frames: usize) -> usize {
        if fifo_frames <= self.fifo_length {
            return 0;
        }
        self.update_period.max(fifo_frames - self.fifo_length).min(fifo_frames)
    }

    fn frame_scores(&self, probs: &[f32]) -> Vec<f32> {
        let speakers = self.speakers;
        let frames = probs.len() / speakers;
        let threshold = self.score_threshold;
        let mut scores = vec![f32::NEG_INFINITY; probs.len()];
        for f in 0..frames {
            let row = &probs[f * speakers..(f + 1) * speakers];
            let log_complements = row.iter().map(|&p| (1.0 - p).max(threshold).ln()).collect::<Vec<_>>();
            let sum_complements = log_complements.iter().sum::<f32>();
            for s in 0..speakers {
                if row[s] > 0.5 {
                    scores[f * speakers + s] = row[s].max(threshold).ln() - log_complements[s] + sum_complements - 0.5f32.ln();
                }
            }
        }
        // A speaker with enough positively scored frames drops its non-positive (overlapped) speech frames.
        for s in 0..speakers {
            let positive = (0..frames).filter(|&f| scores[f * speakers + s] > 0.0).count();
            if positive >= self.min_positive_scores {
                for f in 0..frames {
                    let i = f * speakers + s;
                    if probs[i] > 0.5 && scores[i] <= 0.0 {
                        scores[i] = f32::NEG_INFINITY;
                    }
                }
            }
        }
        scores
    }

    /// Adds `boost` to each speaker's `count` best frames.
    fn boost_scores(&self, scores: &mut [f32], count: usize, boost: f32) {
        let speakers = self.speakers;
        let frames = scores.len() / speakers;
        let count = count.min(frames);
        if count == 0 {
            return;
        }
        let mut order = (0..frames).collect::<Vec<_>>();
        for s in 0..speakers {
            order.sort_unstable_by(|&a, &b| scores[b * speakers + s].total_cmp(&scores[a * speakers + s]));
            for &f in &order[..count] {
                scores[f * speakers + s] += boost;
            }
        }
    }

    /// Keeps the `cache_length` most important frames, grouped by speaker in arrival order,
    /// `silence_frames` slots per speaker filled with the silence embedding.
    fn compress(&self, embeds: &[f32], probs: &[f32], silence: &[f32]) -> (Vec<f32>, Vec<f32>) {
        let (hidden, speakers) = (self.hidden, self.speakers);
        let frames = probs.len() / speakers;

        let mut scores = self.frame_scores(probs);
        for score in &mut scores[self.cache_length * speakers..] {
            *score += self.latest_boost;
        }
        let ln_half = 0.5f32.ln();
        self.boost_scores(&mut scores, self.strong_boosted, -2.0 * ln_half);
        self.boost_scores(&mut scores, self.weak_boosted, -ln_half);

        // Speaker-major flat scores over the frames plus the silence slots (always selected).
        let scored = frames + self.silence_frames;
        let mut flat = Vec::with_capacity(scored * speakers);
        for s in 0..speakers {
            flat.extend((0..frames).map(|f| scores[f * speakers + s]));
            flat.extend(std::iter::repeat_n(f32::INFINITY, self.silence_frames));
        }
        let mut order = (0..flat.len()).collect::<Vec<_>>();
        order.select_nth_unstable_by(self.cache_length - 1, |&a, &b| flat[b].total_cmp(&flat[a]));
        let sentinel = flat.len();
        let mut picked = order[..self.cache_length]
            .iter()
            .map(|&i| if flat[i] == f32::NEG_INFINITY { sentinel } else { i })
            .collect::<Vec<_>>();
        picked.sort_unstable();

        let mut out_embeds = Vec::with_capacity(self.cache_length * hidden);
        let mut out_probs = Vec::with_capacity(self.cache_length * speakers);
        for i in picked {
            // Index `frames` is the silence slot: the silence embedding with zero probabilities.
            let frame = if i == sentinel { frames } else { (i % scored).min(frames) };
            if frame == frames {
                out_embeds.extend_from_slice(silence);
                out_probs.extend(std::iter::repeat_n(0.0, speakers));
            } else {
                out_embeds.extend_from_slice(&embeds[frame * hidden..(frame + 1) * hidden]);
                out_probs.extend_from_slice(&probs[frame * speakers..(frame + 1) * speakers]);
            }
        }
        (out_embeds, out_probs)
    }
}

fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}
