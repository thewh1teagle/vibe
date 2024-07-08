use std::path::PathBuf;

/// wget https://github.com/snakers4/silero-vad/raw/master/files/silero_vad.onnx
/// wget https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_speakerverification_speakernet.onnx
use eyre::{bail, eyre, Result};
use sherpa_rs::{
    embedding_manager, speaker_id,
    vad::{Vad, VadConfig},
};

use crate::transcript::Transcript;

#[derive(Debug)]
pub struct DiarizeSegment {
    pub start_sec: f32,
    pub duration_sec: f32,
    pub speaker: String,
}

pub fn get_diarize_segments(
    vad_model_path: PathBuf,
    speaker_id_model_path: PathBuf,
    audio_path: PathBuf,
) -> Result<Vec<DiarizeSegment>> {
    // Read audio data from the file
    log::debug!("reading file at {}", audio_path.display());
    let (mut samples, sample_rate) = read_audio_file(&audio_path.to_string_lossy())?;
    log::debug!("samples: {} rate: {}", samples.len(), sample_rate);

    if sample_rate != 16000 {
        bail!("The sample rate must be 16000.");
    }

    let extractor_config =
        speaker_id::ExtractorConfig::new(speaker_id_model_path.to_string_lossy().to_string(), None, None, false);
    let mut extractor = speaker_id::EmbeddingExtractor::new_from_config(extractor_config).unwrap();
    let mut embedding_manager = embedding_manager::EmbeddingManager::new(extractor.embedding_size.try_into().unwrap()); // Assuming dimension 512 for embeddings

    let mut speaker_counter = 0;

    let window_size: usize = 512;
    let config = VadConfig::new(
        vad_model_path.to_string_lossy().to_string(),
        0.4,
        0.4,
        0.5,
        sample_rate,
        window_size.try_into().unwrap(),
        None,
        None,
        Some(true),
    );

    let mut vad = Vad::new_from_config(config, 3.0).unwrap();
    let mut segments: Vec<DiarizeSegment> = Vec::new();
    while samples.len() > window_size {
        let window = &samples[..window_size];
        vad.accept_waveform(window.to_vec()); // Convert slice to Vec
        if vad.is_speech() {
            while !vad.is_empty() {
                let segment = vad.front();
                let start_sec = (segment.start as f32) / sample_rate as f32;
                let duration_sec = (segment.samples.len() as f32) / sample_rate as f32;

                // Compute the speaker embedding
                let embedding = extractor
                    .compute_speaker_embedding(sample_rate, segment.samples)
                    .map_err(|e| eyre!("{:?}", e))?;

                let name = if let Some(speaker_name) = embedding_manager.search(&embedding, 0.45) {
                    speaker_name
                } else {
                    // Register a new speaker and add the embedding
                    let name = format!("{}", speaker_counter);
                    embedding_manager
                        .add(name.clone(), &mut embedding.clone())
                        .map_err(|e| eyre!("{:?}", e))?;

                    speaker_counter += 1;
                    name
                };
                log::debug!("({}) start={}s duration={}s", name, start_sec, duration_sec);
                segments.push(DiarizeSegment {
                    start_sec,
                    duration_sec,
                    speaker: name,
                });
                vad.pop();
            }
            vad.clear();
        }
        samples = samples[window_size..].to_vec(); // Move the remaining samples to the next iteration
    }
    Ok(segments)
}

pub fn merge_diarization(diarize_segments: Vec<DiarizeSegment>, mut transcript: Transcript) -> Result<Transcript> {
    // Iterate through each segment in the transcript
    for segment in &mut transcript.segments {
        // Find the corresponding diarize segment
        if let Some(diarize_segment) = find_matching_segment(&diarize_segments, segment.start, segment.stop) {
            // Assign speaker_id to the segment
            log::debug!("found matching segment");
            segment.speaker = Some(diarize_segment.speaker.clone());
        }
    }

    Ok(transcript)
}

// Function to find a matching DiarizeSegment for given start and stop times
fn find_matching_segment(diarize_segments: &[DiarizeSegment], start: i64, stop: i64) -> Option<&DiarizeSegment> {
    let mut start = (start as f32) / 100.0;
    let stop = (stop as f32) / 100.0;

    diarize_segments.iter().find(|&segment| {
        let segment_stop_sec: f32 = segment.start_sec + segment.duration_sec;
        let mut segment_start_sec: f32 = segment.start_sec;

        if start <= 1.0 && segment_start_sec <= 1.0 {
            start = 0.0;
            segment_start_sec = 0.0;
        }
        log::debug!(
            "{} >= {} && {} <= {} : {}",
            start,
            segment_start_sec,
            stop,
            segment_stop_sec,
            start >= segment_start_sec && stop <= segment_stop_sec
        );
        start >= segment_start_sec && stop <= segment_stop_sec
    })
}

fn read_audio_file(path: &str) -> Result<(Vec<f32>, i32)> {
    let mut reader = hound::WavReader::open(path)?;
    let sample_rate = reader.spec().sample_rate as i32;

    // Check if the sample rate is 16000
    if sample_rate != 16000 {
        bail!("The sample rate must be 16000.");
    }

    // Collect samples into a Vec<f32>
    let samples: Vec<f32> = reader.samples::<i16>().map(|s| s.unwrap() as f32 / i16::MAX as f32).collect();

    Ok((samples, sample_rate))
}
