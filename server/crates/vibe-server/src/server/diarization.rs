#[derive(Debug, Clone, serde::Serialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub speaker_id: usize,
}

#[cfg(feature = "diarize")]
pub fn diarize(model_path: &str, samples: &[f32]) -> Vec<Segment> {
    match nemotron_diarize_rs::Diarizer::new(model_path).and_then(|mut diarizer| diarizer.diarize_samples(samples)) {
        Ok(segments) => segments
            .into_iter()
            .map(|segment| Segment {
                start: segment.start,
                end: segment.end,
                speaker_id: segment.speaker_id,
            })
            .collect(),
        Err(err) => {
            tracing::warn!("diarization failed, skipping speakers: {err}");
            Vec::new()
        }
    }
}

#[cfg(not(feature = "diarize"))]
pub fn diarize(model_path: &str, _samples: &[f32]) -> Vec<Segment> {
    tracing::warn!("diarization support is not enabled, skipping model: {model_path}");
    Vec::new()
}
