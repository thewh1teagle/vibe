use crate::{transcribe::create_normalized_audio, transcript::Transcript};
use eyre::{bail, Result};
use sherpa_rs::speaker_identify;
use std::collections::HashMap;
use std::path::PathBuf;

pub fn diarize(model_path: PathBuf, source_audio: PathBuf, mut transcript: Transcript) -> Result<Transcript> {
    log::debug!("diarize");

    // Normalize the audio
    let normalized_audio = create_normalized_audio(source_audio)?;

    // Read the audio file
    let (sample_rate, samples) = read_audio_file(normalized_audio.to_str().unwrap()).unwrap();
    log::debug!("sample rate {} of {} samples", sample_rate, samples.len());

    // Initialize the speaker embedding extractor
    let config = speaker_identify::ExtractorConfig::new(model_path.to_str().unwrap().to_string(), None, None, false);
    let mut extractor = speaker_identify::EmbeddingExtractor::new_from_config(config).unwrap();

    // Placeholder for segment embeddings
    let mut segment_embeddings: Vec<(usize, Vec<f32>)> = Vec::new();

    // Process each segment in the transcript to compute embeddings
    for (i, segment) in transcript.segments.iter().enumerate() {
        // Ensure segment start and stop times are within audio bounds
        let start_seconds = segment.start as f64 / 100.0; // Convert to seconds
        let stop_seconds = segment.stop as f64 / 100.0; // Convert to seconds

        // Calculate sample indices
        let start_sample = (start_seconds * sample_rate as f64) as usize;
        let stop_sample = (stop_seconds * sample_rate as f64) as usize;

        // Check if start_sample and stop_sample are within bounds
        if start_sample >= samples.len() || stop_sample > samples.len() {
            log::error!(
                "Audio segment indices out of bounds: start_sample {}, stop_sample {}",
                start_sample,
                stop_sample
            );
            continue; // Skip this segment or handle the error condition
        }

        // Extract audio segment
        let segment_samples = samples[start_sample..stop_sample].to_vec();

        // Compute embedding for the segment
        if let Ok(segment_embedding) = extractor.compute_speaker_embedding(sample_rate, segment_samples) {
            segment_embeddings.push((i, segment_embedding));
        }
    }

    // Identify speakers based on embeddings similarity
    let mut speaker_id_counter = 0;
    let mut segment_speaker_id: HashMap<usize, usize> = HashMap::new();

    for (i, embedding) in &segment_embeddings {
        let mut assigned = false;

        // Compare with subsequent embeddings
        for (j, _) in segment_embeddings.iter().enumerate().skip(i + 1) {
            let other_embedding = &segment_embeddings[j].1;
            let sim = speaker_identify::compute_cosine_similarity(embedding, other_embedding);
            log::debug!("sim: {}", sim);
            if sim > 0.1 {
                let speaker_id = *segment_speaker_id.get(&j).unwrap_or(&speaker_id_counter);
                segment_speaker_id.insert(*i, speaker_id); // Assign the same speaker ID as j
                assigned = true;
                break;
            }
        }

        if !assigned {
            segment_speaker_id.insert(*i, speaker_id_counter);
            speaker_id_counter += 1;
        }
    }

    // Update the transcript with identified speakers
    for (i, segment) in transcript.segments.iter_mut().enumerate() {
        if let Some(&speaker_id) = segment_speaker_id.get(&i) {
            segment.speaker_id = Some(speaker_id);
        }
    }

    Ok(transcript)
}

fn read_audio_file(path: &str) -> Result<(i32, Vec<f32>)> {
    let mut reader = hound::WavReader::open(path)?;
    let sample_rate = reader.spec().sample_rate as i32;

    // Check if the sample rate is 16000
    if sample_rate != 16000 {
        bail!("The sample rate must be 16000.");
    }

    // Collect samples into a Vec<f32>
    let samples: Vec<f32> = reader.samples::<i16>().map(|s| s.unwrap() as f32 / i16::MAX as f32).collect();

    Ok((sample_rate, samples))
}
