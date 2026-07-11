use std::ffi::CString;
use std::path::{Path, PathBuf};

use whisper_cpp_sys as ffi;

pub const SAMPLE_RATE: usize = 16_000;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid VAD model path")]
    InvalidPath(#[from] std::ffi::NulError),
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
        let defaults = unsafe { ffi::whisper_vad_default_params() };
        Self {
            threshold: defaults.threshold,
            min_speech_ms: defaults.min_speech_duration_ms,
            min_silence_ms: defaults.min_silence_duration_ms,
            speech_pad_ms: defaults.speech_pad_ms,
            max_chunk_ms: 30_000,
            overlap_ms: 500,
        }
    }
}

impl Options {
    /// Preserves whisper.cpp's historical stable-timestamp VAD parameters.
    pub fn stable_timestamps() -> Self {
        let defaults = unsafe { ffi::whisper_vad_default_params() };
        Self {
            threshold: defaults.threshold,
            min_speech_ms: defaults.min_speech_duration_ms,
            min_silence_ms: defaults.min_silence_duration_ms,
            speech_pad_ms: defaults.speech_pad_ms,
            max_chunk_ms: u32::MAX,
            overlap_ms: (defaults.samples_overlap * 1000.0).round() as u32,
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
    ctx: *mut ffi::whisper_vad_context,
    options: Options,
}

impl Vad {
    pub fn new(path: impl AsRef<Path>, options: Options) -> Result<Self> {
        let path = path.as_ref();
        let path_string = path.to_string_lossy();
        let c_path = CString::new(path_string.as_bytes())?;
        let mut params = unsafe { ffi::whisper_vad_default_context_params() };
        params.use_gpu = false;
        let ctx = unsafe { ffi::whisper_vad_init_from_file_with_params(c_path.as_ptr(), params) };
        if ctx.is_null() {
            return Err(Error::LoadModel(path.to_path_buf()));
        }
        Ok(Self { ctx, options })
    }

    pub fn options(&self) -> Options {
        self.options
    }

    pub fn segments(&mut self, samples: &[f32]) -> Result<Vec<SpeechSegment>> {
        if samples.is_empty() {
            return Ok(Vec::new());
        }
        let sample_count = i32::try_from(samples.len()).map_err(|_| Error::TooManySamples)?;
        let mut params = unsafe { ffi::whisper_vad_default_params() };
        params.threshold = self.options.threshold;
        params.min_speech_duration_ms = self.options.min_speech_ms;
        params.min_silence_duration_ms = self.options.min_silence_ms;
        params.speech_pad_ms = self.options.speech_pad_ms;
        params.max_speech_duration_s = self.options.max_chunk_ms as f32 / 1000.0;
        params.samples_overlap = self.options.overlap_ms as f32 / 1000.0;
        let raw = unsafe { ffi::whisper_vad_segments_from_samples(self.ctx, params, samples.as_ptr(), sample_count) };
        if raw.is_null() {
            return Err(Error::Segmentation);
        }
        let raw = RawSegments(raw);
        let count = unsafe { ffi::whisper_vad_segments_n_segments(raw.0) };
        let mut speech = Vec::with_capacity(count.max(0) as usize);
        for index in 0..count {
            let start_s = unsafe { ffi::whisper_vad_segments_get_segment_t0(raw.0, index) };
            let end_s = unsafe { ffi::whisper_vad_segments_get_segment_t1(raw.0, index) };
            let start = centiseconds_to_sample(start_s, samples.len());
            let end = centiseconds_to_sample(end_s, samples.len());
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

impl Drop for Vad {
    fn drop(&mut self) {
        if !self.ctx.is_null() {
            unsafe { ffi::whisper_vad_free(self.ctx) };
        }
    }
}

unsafe impl Send for Vad {}

struct RawSegments(*mut ffi::whisper_vad_segments);

impl Drop for RawSegments {
    fn drop(&mut self) {
        unsafe { ffi::whisper_vad_free_segments(self.0) };
    }
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
