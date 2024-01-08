use anyhow::{bail, Context, Ok, Result};
use hound::{SampleFormat, WavReader};
use log::debug;
use std::io::Write;
use std::path::Path;
use std::{fs::OpenOptions, mem, path::PathBuf};
use tempfile::TempDir;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::args::Args;
use crate::config;

struct Model {}

fn parse_wav_file(path: &PathBuf) -> Result<Vec<i16>> {
    let reader = WavReader::open(path).expect("failed to read file");
    debug!("parsing {}", path.display());

    let channels = reader.spec().channels;
    if reader.spec().channels != 1 {
        bail!("expected mono audio file and found {} channels!", channels);
    }
    if reader.spec().sample_format != SampleFormat::Int {
        bail!("expected integer sample format");
    }
    if reader.spec().sample_rate != 16000 {
        bail!("expected 16KHz sample rate");
    }
    if reader.spec().bits_per_sample != 16 {
        bail!("expected 16 bits per sample");
    }

    let result = reader.into_samples::<i16>().map(|x| x.expect("sample")).collect::<Vec<_>>();
    Ok(result)
}

pub fn transcribe(args: Args) -> Result<()> {
    let model_path: PathBuf = if let Some(model_str) = args.model {
        PathBuf::from(model_str)
    } else {
        config::get_model_path()?
    };
    let audio_path = PathBuf::from(args.path);

    if !model_path.exists() {
        bail!("whisper file doesn't exist")
    }

    if !audio_path.exists() {
        bail!("audio file doesn't exist")
    }

    let original_samples = parse_wav_file(&audio_path)?;
    let samples = whisper_rs::convert_integer_to_float_audio(&original_samples);

    debug!("open model...");
    let ctx = WhisperContext::new_with_params(&model_path.to_string_lossy(), WhisperContextParameters::default())
        .expect("failed to open model");
    let mut state = ctx.create_state().expect("failed to create key");

    let mut params = FullParams::new(SamplingStrategy::default());
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_progress_callback_safe(|progress| println!("Progress callback: {}%", progress));
    // params.set_initial_prompt("experience");
    debug!("set progress bar...");

    debug!("set language to {:?}", args.lang);
    params.set_language(args.lang.map(Into::into));

    if let Some(n_threads) = args.n_threads {
        params.set_n_threads(n_threads);
    }
    // params.set_print_special(verbose);

    debug!("set start time...");
    let st = std::time::Instant::now();
    debug!("setting state full...");
    state.full(params, &samples).expect("failed to convert samples");
    let et = std::time::Instant::now();

    debug!("getting segments count...");
    let num_segments = state.full_n_segments().expect("failed to get number of segments");
    debug!("found {} segments", num_segments);
    if let Some(output_path) = &args.output {
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .append(true) // Change to .truncate(true) for overwrite instead of append
            .open(output_path)
            .expect("failed to open file");
        debug!("looping segments...");
        for i in 0..num_segments {
            let segment = state.full_get_segment_text(i).expect("failed to get segment");
            let start_timestamp = state.full_get_segment_t0(i).expect("failed to get start timestamp");
            let end_timestamp = state.full_get_segment_t1(i).expect("failed to get end timestamp");

            // Print to console
            println!("[{} - {}]\n{}", start_timestamp, end_timestamp, segment);

            // Write to file
            writeln!(file, "[{} - {}]\n{}", start_timestamp, end_timestamp, segment).expect("failed to write to file");
            file.flush().expect("failed to flush to file!");
        }
    } else {
        debug!("looping segments...");
        for i in 0..num_segments {
            let segment = state.full_get_segment_text(i).expect("failed to get segment");
            let start_timestamp = state.full_get_segment_t0(i).expect("failed to get start timestamp");
            let end_timestamp = state.full_get_segment_t1(i).expect("failed to get end timestamp");

            // Print to console only
            println!("[{} - {}]\n{}", start_timestamp, end_timestamp, segment);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::{args, audio::Audio, config};

    use super::*;
    use anyhow::Result;
    use log::debug;
    use std::fs;
    use tempfile::tempdir;

    fn init() {
        let _ = env_logger::builder().is_test(true).try_init();
    }

    fn wait_for_enter() -> Result<()> {
        println!("PRESS ENTER");
        let mut buffer = String::new();
        std::io::stdin().read_line(&mut buffer)?;
        Ok(())
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
        wait_for_enter()?;
        let audio = Audio::try_create()?;
        audio.convert(input_file_path.clone(), output_file_path.clone())?;
        debug!("check output at {}", output_file_path.display());
        wait_for_enter()?;
        let args = args::Args {
            path: input_file_path.to_str().unwrap().to_owned(),
            model: Some(config::get_model_path()?.to_str().unwrap().to_owned()),
            lang: None,
            n_threads: None,
            output: None,
            verbose: false,
        };
        transcribe(args)?;

        Ok(())
    }
}
