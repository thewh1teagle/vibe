//! Turning per-frame speaker probabilities into segments: median smoothing,
//! then hysteresis binarisation with padding and gap merging.
//!
//! Ported unchanged from `parakeet-rs 0.3.x` `src/sortformer.rs` (MIT OR
//! Apache-2.0, Copyright (c) 2025 Enes Altun).

use ndarray::Array2;

use super::{DiarizationConfig, SpeakerSegment, FRAME_DURATION, NUM_SPEAKERS, SAMPLE_RATE};

/// Median filter over time, per speaker, with a shrinking window at the edges.
pub(crate) fn median_filter(config: &DiarizationConfig, preds: &Array2<f32>) -> Array2<f32> {
    let window = config.median_window;
    let half = window / 2;
    let mut filtered = preds.clone();

    for spk in 0..NUM_SPEAKERS {
        for t in 0..preds.shape()[0] {
            let start = t.saturating_sub(half);
            let end = (t + half + 1).min(preds.shape()[0]);

            let mut values: Vec<f32> = (start..end).map(|i| preds[[i, spk]]).collect();
            values.sort_by(|a, b| a.partial_cmp(b).unwrap());

            filtered[[t, spk]] = values[values.len() / 2];
        }
    }

    filtered
}

/// Binarize predictions to segments (padding applied during thresholding).
///
/// Hysteresis: a segment opens at `onset` and only closes once the probability
/// drops below `offset`, so the two thresholds can differ.
pub(crate) fn binarize(config: &DiarizationConfig, preds: &Array2<f32>) -> Vec<SpeakerSegment> {
    let mut segments = Vec::new();
    let num_frames = preds.shape()[0];

    // Convert the config thresholds from seconds to samples up front.
    let pad_onset_samples = (config.pad_onset * SAMPLE_RATE as f32) as u64;
    let pad_offset_samples = (config.pad_offset * SAMPLE_RATE as f32) as u64;
    let min_dur_on_samples = (config.min_duration_on * SAMPLE_RATE as f32) as u64;
    let min_dur_off_samples = (config.min_duration_off * SAMPLE_RATE as f32) as u64;
    let samples_per_frame = (FRAME_DURATION * SAMPLE_RATE as f32) as u64;

    for spk in 0..NUM_SPEAKERS {
        let mut in_seg = false;
        let mut seg_start = 0;
        let mut temp_segments = Vec::new();

        for t in 0..num_frames {
            let p = preds[[t, spk]];

            if p >= config.onset && !in_seg {
                in_seg = true;
                seg_start = t;
            } else if p < config.offset && in_seg {
                in_seg = false;

                let start_s = (seg_start as u64 * samples_per_frame).saturating_sub(pad_onset_samples);
                let end_s = t as u64 * samples_per_frame + pad_offset_samples;

                if end_s - start_s >= min_dur_on_samples {
                    temp_segments.push(SpeakerSegment {
                        start: start_s,
                        end: end_s,
                        speaker_id: spk,
                    });
                }
            }
        }

        // Handle a segment still open at the end.
        if in_seg {
            let start_s = (seg_start as u64 * samples_per_frame).saturating_sub(pad_onset_samples);
            let end_s = num_frames as u64 * samples_per_frame + pad_offset_samples;

            if end_s - start_s >= min_dur_on_samples {
                temp_segments.push(SpeakerSegment {
                    start: start_s,
                    end: end_s,
                    speaker_id: spk,
                });
            }
        }

        // Merge close segments (min_duration_off).
        if temp_segments.len() > 1 {
            let mut filtered = vec![temp_segments[0].clone()];
            for seg in temp_segments.into_iter().skip(1) {
                let last = filtered.last_mut().unwrap();
                // saturating_sub: overlapping segments (gap < 0) always merge.
                let gap = seg.start.saturating_sub(last.end);
                if gap < min_dur_off_samples {
                    last.end = seg.end; // Merge
                } else {
                    filtered.push(seg);
                }
            }
            segments.extend(filtered);
        } else {
            segments.extend(temp_segments);
        }
    }

    // Sort by start time.
    segments.sort_by_key(|s| s.start);
    segments
}
