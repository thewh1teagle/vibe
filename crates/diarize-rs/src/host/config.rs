//! Post-processing configuration and the segment type it produces.
//!
//! Ported from `parakeet-rs 0.3.x` `src/sortformer.rs` (MIT OR Apache-2.0,
//! Copyright (c) 2025 Enes Altun).

/// Post-processing configuration for speaker diarization. (NVIDIA official
/// configs from the v2 YAMLs.)
///
/// Controls how raw model predictions are converted into speaker segments.
/// NVIDIA provides pre-tuned configs for different datasets (CallHome,
/// DIHARD3, AMI).
///
/// # Parameters
/// - `onset`: probability threshold to START a speaker segment (higher = more strict)
/// - `offset`: probability threshold to END a speaker segment (lower = longer segments)
/// - `pad_onset`: seconds to subtract from segment start times
/// - `pad_offset`: seconds to add to segment end times
/// - `min_duration_on`: minimum segment length in seconds (filters short blips)
/// - `min_duration_off`: minimum gap between segments before merging
/// - `median_window`: smoothing window size (odd number, higher = smoother)
///
/// # Pre-tuned configs
/// - [`DiarizationConfig::callhome`] (default)
/// - [`DiarizationConfig::dihard3`]
///
/// Use [`DiarizationConfig::custom`] to create your own for fine-tuning.
///
/// See: <https://github.com/NVIDIA-NeMo/NeMo/tree/main/examples/speaker_tasks/diarization/conf/neural_diarizer>
#[derive(Debug, Clone)]
pub struct DiarizationConfig {
    pub onset: f32,
    pub offset: f32,
    pub pad_onset: f32,
    pub pad_offset: f32,
    pub min_duration_on: f32,
    pub min_duration_off: f32,
    pub median_window: usize,
}

impl Default for DiarizationConfig {
    fn default() -> Self {
        Self::callhome()
    }
}

impl DiarizationConfig {
    /// CallHome config for v2 (the default).
    /// From `diar_streaming_sortformer_4spk-v2_callhome-part1.yaml`.
    pub fn callhome() -> Self {
        Self {
            onset: 0.641,
            offset: 0.561,
            pad_onset: 0.229,
            pad_offset: 0.079,
            min_duration_on: 0.511,
            min_duration_off: 0.296,
            median_window: 11,
        }
    }

    /// DIHARD3 config for v2.
    /// From `diar_streaming_sortformer_4spk-v2_dihard3-dev.yaml`.
    pub fn dihard3() -> Self {
        Self {
            onset: 0.56,
            offset: 1.0,
            pad_onset: 0.063,
            pad_offset: 0.002,
            min_duration_on: 0.007,
            min_duration_off: 0.151,
            median_window: 11,
        }
    }

    /// A custom config for fine-tuning diarization behaviour.
    ///
    /// * `onset` — threshold to start a segment (0.0-1.0, typical 0.5-0.7)
    /// * `offset` — threshold to end a segment (0.0-1.0, typical 0.4-0.6)
    pub fn custom(onset: f32, offset: f32) -> Self {
        Self {
            onset,
            offset,
            pad_onset: 0.0,
            pad_offset: 0.0,
            min_duration_on: 0.1,
            min_duration_off: 0.1,
            median_window: 11,
        }
    }
}

/// Speaker segment with start/end as sample offsets at 16 kHz, and speaker ID.
///
/// ```rust,ignore
/// let secs = seg.start as f64 / 16_000.0;
/// let nanos = seg.start as u64 * 1_000_000_000 / 16_000;
/// ```
#[derive(Debug, Clone)]
pub struct SpeakerSegment {
    /// Start position in samples at 16 kHz.
    pub start: u64,
    /// End position in samples at 16 kHz.
    pub end: u64,
    pub speaker_id: usize,
}
