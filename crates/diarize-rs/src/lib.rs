use std::path::{Path, PathBuf};

use parakeet_rs::sortformer::{DiarizationConfig, Sortformer};
use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("failed to initialize diarizer from {path}: {source}")]
    Init {
        path: PathBuf,
        source: Box<dyn std::error::Error + Send + Sync>,
    },
    #[error("diarization failed: {0}")]
    Diarize(Box<dyn std::error::Error + Send + Sync>),
}

pub struct Diarizer {
    sortformer: Sortformer,
}

impl Diarizer {
    pub fn new(model_path: impl AsRef<Path>) -> Result<Self> {
        let path = model_path.as_ref();
        let sortformer =
            Sortformer::with_config(path.to_string_lossy().as_ref(), None, DiarizationConfig::callhome())
                .map_err(|source| Error::Init {
                    path: path.to_path_buf(),
                    source: Box::new(source),
                })?;
        Ok(Self { sortformer })
    }

    pub fn diarize(
        &mut self,
        samples: &[f32],
        sample_rate: u32,
        channels: u16,
    ) -> Result<Vec<Segment>> {
        let speaker_segments = self
            .sortformer
            .diarize(samples.to_vec(), sample_rate, channels)
            .map_err(|source| Error::Diarize(Box::new(source)))?;

        Ok(speaker_segments
            .into_iter()
            .map(|segment| Segment {
                start: segment.start as f64 / 16_000.0,
                end: segment.end as f64 / 16_000.0,
                speaker_id: segment.speaker_id,
            })
            .collect())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub speaker_id: usize,
}
