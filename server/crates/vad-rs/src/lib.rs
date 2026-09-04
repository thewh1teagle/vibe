//! Silero VAD segmentation on ggml.
//!
//! Previously this crate called whisper.cpp's `whisper_vad_*` API; it now
//! runs the same model with the same graph directly on ggml (see
//! [`silero`]), and ports whisper.cpp's probability-to-segment state machine
//! below, so the output is unchanged.

use std::path::{Path, PathBuf};

mod model;
mod silero;

pub const SAMPLE_RATE: usize = 16_000;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("failed to load VAD model from {0}")]
    LoadModel(PathBuf),
    #[error("failed to run VAD segmentation")]
    Segmentation,
    #[error("sample count exceeds the VAD API limit")]
    TooManySamples,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Options {
    pub threshold: f32,
    pub min_speech_ms: i32,
    pub min_silence_ms: i32,
    pub speech_pad_ms: i32,
    pub max_chunk_ms: u32,
    pub overlap_ms: u32,
}

impl Default for Options {
    fn default() -> Self {
        // whisper.cpp's whisper_vad_default_params().
        Self {
            threshold: 0.5,
            min_speech_ms: 250,
            min_silence_ms: 100,
            speech_pad_ms: 30,
            max_chunk_ms: 30_000,
            overlap_ms: 500,
        }
    }
}

impl Options {
    /// Preserves whisper.cpp's historical stable-timestamp VAD parameters.
    pub fn stable_timestamps() -> Self {
        Self {
            max_chunk_ms: u32::MAX,
            // whisper_vad_default_params().samples_overlap (0.1 s).
            overlap_ms: 100,
            ..Self::default()
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpeechSegment {
    pub start_sample: usize,
    pub end_sample: usize,
}

impl SpeechSegment {
    pub fn start_centiseconds(self) -> i64 {
        (self.start_sample as i64 * 100) / SAMPLE_RATE as i64
    }
}

pub struct Vad {
    silero: silero::Silero,
    options: Options,
}

impl Vad {
    pub fn new(path: impl AsRef<Path>, options: Options) -> Result<Self> {
        let path = path.as_ref();
        let load_error = || Error::LoadModel(path.to_path_buf());
        let model = model::Model::load(path).ok_or_else(load_error)?;
        let silero = silero::Silero::new(model).ok_or_else(load_error)?;
        Ok(Self { silero, options })
    }

    pub fn options(&self) -> Options {
        self.options
    }

    pub fn segments(&mut self, samples: &[f32]) -> Result<Vec<SpeechSegment>> {
        if samples.is_empty() {
            return Ok(Vec::new());
        }
        // The whisper.cpp API this replaces took an i32 sample count.
        i32::try_from(samples.len()).map_err(|_| Error::TooManySamples)?;
        let probs = self.silero.probs(samples).ok_or(Error::Segmentation)?;
        let n_window = self.silero.n_window();
        let mut speech = Vec::new();
        for (start_cs, end_cs) in segments_from_probs(&probs, n_window, self.options) {
            let start = centiseconds_to_sample(start_cs as f32, samples.len());
            let end = centiseconds_to_sample(end_cs as f32, samples.len());
            if end > start {
                speech.push(SpeechSegment {
                    start_sample: start,
                    end_sample: end,
                });
            }
        }
        Ok(coalesce_bounded(&speech, samples.len(), self.options))
    }
}

/// whisper.cpp's `samples_to_cs`.
fn samples_to_cs(samples: i64) -> i64 {
    (samples as f64 / SAMPLE_RATE as f64 * 100.0 + 0.5) as i64
}

/// Port of `whisper_vad_segments_from_probs` (whisper.cpp:5211): the Silero
/// hysteresis state machine over per-window probabilities, followed by the
/// gap-merge, minimum-duration and padding post-processing. Returns segments
/// in centiseconds, as the whisper.cpp API did.
fn segments_from_probs(probs: &[f32], n_window: usize, options: Options) -> Vec<(i64, i64)> {
    let sample_rate = SAMPLE_RATE as i64;
    let n_window = n_window as i64;
    let min_silence_samples = sample_rate * i64::from(options.min_silence_ms) / 1000;
    let audio_length_samples = probs.len() as i64 * n_window;
    let min_speech_samples = sample_rate * i64::from(options.min_speech_ms) / 1000;
    let speech_pad_samples = sample_rate * i64::from(options.speech_pad_ms) / 1000;

    let max_speech_duration_s = options.max_chunk_ms as f32 / 1000.0;
    let max_speech_samples = if max_speech_duration_s > 100_000.0 {
        i64::from(i32::MAX / 2)
    } else {
        // The C++ truncates the float duration to an integer second count.
        let samples = sample_rate * max_speech_duration_s as i64 - n_window - 2 * speech_pad_samples;
        if (0..=i64::from(i32::MAX)).contains(&samples) {
            samples
        } else {
            i64::from(i32::MAX / 2)
        }
    };
    // Silence this long marks a potential split point for max-duration cuts;
    // the 98 ms constant comes from the original silero-vad implementation.
    let min_silence_samples_at_max_speech = sample_rate * 98 / 1000;

    let neg_threshold = (options.threshold - 0.15).max(0.01);

    let mut speeches: Vec<(i64, i64)> = Vec::new();
    let mut is_speech_segment = false;
    let mut temp_end = 0i64;
    let mut prev_end = 0i64;
    let mut next_start = 0i64;
    let mut curr_speech_start = 0i64;
    let mut has_curr_speech = false;

    for (index, &curr_prob) in probs.iter().enumerate() {
        let curr_sample = n_window * index as i64;

        // Reset temp_end when we get back to speech.
        if curr_prob >= options.threshold && temp_end != 0 {
            temp_end = 0;
            if next_start < prev_end {
                next_start = curr_sample;
            }
        }

        // Start a new speech segment when probability exceeds the threshold
        // and we are not already in speech.
        if curr_prob >= options.threshold && !is_speech_segment {
            is_speech_segment = true;
            curr_speech_start = curr_sample;
            has_curr_speech = true;
            continue;
        }

        // Handle maximum speech duration.
        if is_speech_segment && (curr_sample - curr_speech_start) > max_speech_samples {
            if prev_end != 0 {
                speeches.push((curr_speech_start, prev_end));
                has_curr_speech = true;
                if next_start < prev_end {
                    // Previously reached silence and it is still not speech.
                    is_speech_segment = false;
                    has_curr_speech = false;
                } else {
                    curr_speech_start = next_start;
                }
                prev_end = 0;
                next_start = 0;
                temp_end = 0;
            } else {
                speeches.push((curr_speech_start, curr_sample));
                prev_end = 0;
                next_start = 0;
                temp_end = 0;
                is_speech_segment = false;
                has_curr_speech = false;
                continue;
            }
        }

        // Handle silence after speech.
        if curr_prob < neg_threshold && is_speech_segment {
            if temp_end == 0 {
                temp_end = curr_sample;
            }
            // Track potential segment ends for max-duration handling.
            if (curr_sample - temp_end) > min_silence_samples_at_max_speech {
                prev_end = temp_end;
            }
            if (curr_sample - temp_end) >= min_silence_samples {
                // End the segment if it is long enough.
                if (temp_end - curr_speech_start) > min_speech_samples {
                    speeches.push((curr_speech_start, temp_end));
                }
                prev_end = 0;
                next_start = 0;
                temp_end = 0;
                is_speech_segment = false;
                has_curr_speech = false;
            }
        }
    }

    // Close a speech segment still open at the end of the audio.
    if has_curr_speech && (audio_length_samples - curr_speech_start) > min_speech_samples {
        speeches.push((curr_speech_start, audio_length_samples));
    }

    // Merge adjacent segments separated by less than 200 ms.
    let max_merge_gap_samples = sample_rate * 200 / 1000;
    let mut index = 0;
    while index + 1 < speeches.len() {
        if speeches[index + 1].0 - speeches[index].1 < max_merge_gap_samples {
            speeches[index].1 = speeches[index + 1].1;
            speeches.remove(index + 1);
        } else {
            index += 1;
        }
    }

    speeches.retain(|(start, end)| end - start >= min_speech_samples);

    // Pad segment boundaries outward, splitting short gaps down the middle.
    let count = speeches.len();
    for index in 0..count {
        if index == 0 {
            speeches[index].0 = (speeches[index].0 - speech_pad_samples).max(0);
        }
        if index < count - 1 {
            let silence_duration = speeches[index + 1].0 - speeches[index].1;
            if silence_duration < 2 * speech_pad_samples {
                speeches[index].1 += silence_duration / 2;
                speeches[index + 1].0 = (speeches[index + 1].0 - silence_duration / 2).max(0);
            } else {
                speeches[index].1 = (speeches[index].1 + speech_pad_samples).min(audio_length_samples);
                speeches[index + 1].0 = (speeches[index + 1].0 - speech_pad_samples).max(0);
            }
        } else {
            speeches[index].1 = (speeches[index].1 + speech_pad_samples).min(audio_length_samples);
        }
    }

    speeches
        .into_iter()
        .map(|(start, end)| (samples_to_cs(start), samples_to_cs(end)))
        .collect()
}

fn centiseconds_to_sample(centiseconds: f32, sample_count: usize) -> usize {
    (centiseconds.max(0.0) as f64 * SAMPLE_RATE as f64 / 100.0)
        .round()
        .clamp(0.0, sample_count as f64) as usize
}

fn split_bounded(start: usize, end: usize, sample_count: usize, options: Options, out: &mut Vec<SpeechSegment>) {
    let max = options
        .max_chunk_ms
        .try_into()
        .unwrap_or(usize::MAX)
        .saturating_mul(SAMPLE_RATE)
        .checked_div(1000)
        .unwrap_or(usize::MAX)
        .max(1);
    let overlap = usize::try_from(options.overlap_ms)
        .unwrap_or(usize::MAX)
        .saturating_mul(SAMPLE_RATE)
        .checked_div(1000)
        .unwrap_or(usize::MAX)
        .min(max.saturating_sub(1));
    let mut cursor = start;
    while cursor < end {
        let chunk_end = cursor.saturating_add(max).min(end).min(sample_count);
        out.push(SpeechSegment {
            start_sample: cursor,
            end_sample: chunk_end,
        });
        if chunk_end >= end {
            break;
        }
        cursor = chunk_end.saturating_sub(overlap);
    }
}

fn coalesce_bounded(speech: &[SpeechSegment], sample_count: usize, options: Options) -> Vec<SpeechSegment> {
    let max = usize::try_from(options.max_chunk_ms)
        .unwrap_or(usize::MAX)
        .saturating_mul(SAMPLE_RATE)
        .checked_div(1000)
        .unwrap_or(usize::MAX)
        .max(1);
    let mut result = Vec::new();
    let Some(first) = speech.first().copied() else {
        return result;
    };
    let mut start = first.start_sample;
    let mut end = first.end_sample;
    for segment in &speech[1..] {
        if segment.end_sample.saturating_sub(start) <= max {
            end = segment.end_sample;
        } else {
            split_bounded(start, end, sample_count, options, &mut result);
            start = segment.start_sample;
            end = segment.end_sample;
        }
    }
    split_bounded(start, end, sample_count, options, &mut result);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hard_splits_with_overlap() {
        let mut result = Vec::new();
        split_bounded(
            0,
            160_000,
            160_000,
            Options {
                max_chunk_ms: 4_000,
                overlap_ms: 500,
                ..Options::default()
            },
            &mut result,
        );
        assert_eq!(
            result[0],
            SpeechSegment {
                start_sample: 0,
                end_sample: 64_000
            }
        );
        assert_eq!(result[1].start_sample, 56_000);
        assert!(result
            .iter()
            .all(|segment| segment.end_sample - segment.start_sample <= 64_000));
        assert_eq!(result.last().unwrap().end_sample, 160_000);
    }

    #[test]
    fn coalesces_nearby_speech_into_context_window() {
        let speech = [
            SpeechSegment {
                start_sample: 1_000,
                end_sample: 20_000,
            },
            SpeechSegment {
                start_sample: 30_000,
                end_sample: 50_000,
            },
        ];
        let result = coalesce_bounded(&speech, 60_000, Options::default());
        assert_eq!(
            result,
            vec![SpeechSegment {
                start_sample: 1_000,
                end_sample: 50_000
            }]
        );
    }
}
