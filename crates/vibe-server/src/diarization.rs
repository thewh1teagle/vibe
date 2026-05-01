use anyhow::Result;
use parakeet_rs::sortformer::{DiarizationConfig, Sortformer};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SpeakerSegment {
    pub start: f64,
    pub end: f64,
    pub speaker_id: i32,
}

pub fn diarize(model_path: &str, samples: &[f32]) -> Result<Vec<SpeakerSegment>> {
    let mut sortformer = Sortformer::with_config(model_path, None, DiarizationConfig::callhome())?;
    let segments = sortformer.diarize(samples.to_vec(), 16_000, 1)?;
    Ok(segments
        .into_iter()
        .map(|segment| SpeakerSegment {
            start: segment.start as f64 / 16_000.0,
            end: segment.end as f64 / 16_000.0,
            speaker_id: segment.speaker_id as i32,
        })
        .collect())
}

pub fn match_speaker(start: f64, end: f64, segments: &[SpeakerSegment]) -> Option<i32> {
    segments
        .iter()
        .filter_map(|segment| {
            let overlap_start = start.max(segment.start);
            let overlap_end = end.min(segment.end);
            let overlap = overlap_end - overlap_start;
            (overlap > 0.0).then_some((overlap, segment.speaker_id))
        })
        .max_by(|left, right| left.0.total_cmp(&right.0))
        .map(|(_, speaker)| speaker)
}
