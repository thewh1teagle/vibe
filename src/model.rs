use std::{path::PathBuf, mem, fs::OpenOptions};
use anyhow::{Context, Result};
use tempfile::TempDir;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
use hound::{SampleFormat, WavReader};
use std::path::Path;
use log::debug;
use std::io::Write;

struct Model {}


fn parse_wav_file(path: &PathBuf) -> Vec<i16> {
    let reader = WavReader::open(path).expect("failed to read file");
    debug!("parsing {}", path.display());

    let channels = reader.spec().channels;
    if reader.spec().channels != 1 {
        panic!("expected mono audio file and found {} channels!", channels);
    }
    if reader.spec().sample_format != SampleFormat::Int {
        panic!("expected integer sample format");
    }
    if reader.spec().sample_rate != 16000 {
        panic!("expected 16KHz sample rate");
    }
    if reader.spec().bits_per_sample != 16 {
        panic!("expected 16 bits per sample");
    }

    reader
        .into_samples::<i16>()
        .map(|x| x.expect("sample"))
        .collect::<Vec<_>>()
}

pub fn transcribe(audio_path: PathBuf, whisper_path: PathBuf, output_path: Option<PathBuf>,language: Option<&str>, verbose: bool, n_threads: Option<i32>) {
    if !whisper_path.exists() {
        panic!("whisper file doesn't exist")
    }

    if !audio_path.exists() {
        panic!("audio file doesn't exist")
    }
    
    let original_samples = parse_wav_file(&audio_path);
    let samples = whisper_rs::convert_integer_to_float_audio(&original_samples);

    debug!("open model...");
    let ctx = WhisperContext::new_with_params(
        &whisper_path.to_string_lossy(),
        WhisperContextParameters::default()
    ).expect("failed to open model");
    let mut state = ctx.create_state().expect("failed to create key");
    
    let mut params = FullParams::new(SamplingStrategy::default());
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_progress_callback_safe(|progress| println!("Progress callback: {}%", progress));
    // params.set_initial_prompt("experience");
    debug!("set progress bar...");

    
    debug!("set language to {:?}", language);
    params.set_language(language);

    if let Some(n_threads) = n_threads {
        params.set_n_threads(n_threads);
    }
    // params.set_print_special(verbose);
    
    debug!("set start time...");
    let st = std::time::Instant::now();
    debug!("setting state full...");
    state
        .full(params, &samples)
        .expect("failed to convert samples");
    let et = std::time::Instant::now();

    debug!("getting segments count...");
    let num_segments = state
        .full_n_segments()
        .expect("failed to get number of segments");
    debug!("found {} segments", num_segments);
    if let Some(output_path) = &output_path {
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .append(true) // Change to .truncate(true) for overwrite instead of append
            .open(output_path)
            .expect("failed to open file");
        debug!("looping segments...");
        for i in 0..num_segments {
            let segment = state
                .full_get_segment_text(i)
                .expect("failed to get segment");
            let start_timestamp = state
                .full_get_segment_t0(i)
                .expect("failed to get start timestamp");
            let end_timestamp = state
                .full_get_segment_t1(i)
                .expect("failed to get end timestamp");
    
            // Print to console
            println!("[{} - {}]\n{}", start_timestamp, end_timestamp, segment);
    
            // Write to file
            writeln!(file, "[{} - {}]\n{}", start_timestamp, end_timestamp, segment)
                .expect("failed to write to file");
            file.flush().expect("failed to flush to file!");
        }
    } else {
        debug!("looping segments...");
        for i in 0..num_segments {
            let segment = state
                .full_get_segment_text(i)
                .expect("failed to get segment");
            let start_timestamp = state
                .full_get_segment_t0(i)
                .expect("failed to get start timestamp");
            let end_timestamp = state
                .full_get_segment_t1(i)
                .expect("failed to get end timestamp");
    
            // Print to console only
            println!("[{} - {}]\n{}", start_timestamp, end_timestamp, segment);
        }
    }
}


#[cfg(test)]
mod tests {
    use crate::{audio::Audio, config};

    use super::*;
    use std::fs;
    use tempfile::tempdir;
    use anyhow::Result;
    use log::debug;

    fn init() {
        let _ = env_logger::builder().is_test(true).try_init();
    }

    fn wait_for_enter() {
        println!("PRESS ENTER");
        let mut buffer = String::new();
        std::io::stdin().read_line(&mut buffer).unwrap();
    }

    #[test]
    fn test_audio_conversion() -> Result<()> {
        init();
        debug!("test");
        // Create a temporary directory to store input and output files.
        let temp_dir = tempdir()?;
        let input_file_path = temp_dir.path().join("input.mp3");
        let output_file_path = temp_dir.path().join("output.wav");

        // Copy a sample input file to the temporary directory.
        debug!("copying from {} to {}", "src/audio/test_audio.wav", input_file_path.display());
        fs::copy("src/audio/test_audio.wav", &input_file_path)?;
        wait_for_enter();
        let audio = Audio::try_create()?;
        audio.convert(input_file_path.clone(), output_file_path.clone())?;
        debug!("check output at {}", output_file_path.display());
        wait_for_enter();
        transcribe(input_file_path, config::get_model_path()?, None, None, true, None);

        Ok(())
    }
}