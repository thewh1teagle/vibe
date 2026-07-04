#[cfg(feature = "diarize")]
pub use diarize_rs::Segment;

#[cfg(not(feature = "diarize"))]
#[derive(Debug, Clone, serde::Serialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub speaker_id: usize,
}

#[cfg(feature = "diarize")]
pub fn diarize(model_path: &str, samples: &[f32]) -> Vec<Segment> {
    match diarize_rs::Diarizer::new(model_path)
        .and_then(|mut diarizer| diarizer.diarize(samples, 16_000, 1))
    {
        Ok(segments) => segments,
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
