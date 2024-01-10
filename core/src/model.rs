use anyhow::{bail, Ok, Result};
use log::debug;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::audio;
use crate::config::ModelArgs;

pub fn transcribe(options: &ModelArgs) -> Result<String> {
    if !options.model.exists() {
        bail!("whisper file doesn't exist")
    }

    if !options.path.clone().exists() {
        bail!("audio file doesn't exist")
    }

    let out_path = tempfile::Builder::new()
        .suffix(".wav")
        .tempfile()?
        .into_temp_path()
        .to_path_buf();
    audio::normalize(options.path.clone(), out_path.clone(), "0".to_owned())?;
    let original_samples = audio::parse_wav_file(&options.path.clone())?;
    let samples = whisper_rs::convert_integer_to_float_audio(&original_samples);

    debug!("open model...");
    let ctx = WhisperContext::new_with_params(&options.model.to_str().unwrap(), WhisperContextParameters::default())
        .expect("failed to open model");
    let mut state = ctx.create_state().expect("failed to create key");

    let mut params = FullParams::new(SamplingStrategy::default());
    debug!("set language to {:?}", options.lang);
    if options.lang.is_some() {
        params.set_language(options.lang.as_deref());
    }

    params.set_print_special(false);
    params.set_print_progress(true);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_token_timestamps(true);
    params.set_progress_callback_safe(|progress| println!("Progress callback: {}%", progress));
    // params.set_initial_prompt("experience");
    debug!("set progress bar...");

    if let Some(n_threads) = options.n_threads {
        params.set_n_threads(n_threads);
    }
    // params.set_print_special(verbose);

    debug!("set start time...");
    let _st = std::time::Instant::now();
    debug!("setting state full...");
    state.full(params, &samples).expect("failed to convert samples");
    let _et = std::time::Instant::now();

    debug!("getting segments count...");
    let num_segments = state.full_n_segments().expect("failed to get number of segments");
    debug!("found {} segments", num_segments);
    let mut buffer = String::new();
    // let mut file = OpenOptions::new()
    //     .create(true)
    //     .write(true)
    //     .append(true) // Change to .truncate(true) for overwrite instead of append
    //     .open(options.output.clone())
    //     .expect("failed to open file");
    debug!("looping segments...");
    for i in 0..num_segments {
        let segment = state.full_get_segment_text(i).expect("failed to get segment");
        let start_timestamp = state.full_get_segment_t0(i).expect("failed to get start timestamp");
        let end_timestamp = state.full_get_segment_t1(i).expect("failed to get end timestamp");

        // Print to console
        println!("[{} - {}]\n{}", start_timestamp, end_timestamp, segment);

        // Write to file
        buffer.push_str(&format!("[{} - {}]\n{}", start_timestamp, end_timestamp, segment))
        // writeln!(file, "[{} - {}]\n{}", start_timestamp, end_timestamp, segment).expect("failed to write to file");
        // file.flush().expect("failed to flush to file!");
    }

    Ok(buffer)
}

#[cfg(test)]
mod tests {
    use crate::{audio, config};

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
        audio::normalize(input_file_path.clone(), output_file_path.clone(), "".to_owned())?;
        debug!("check output at {}", output_file_path.display());
        wait_for_enter()?;
        let args = &config::ModelArgs {
            path: input_file_path.to_str().unwrap().to_owned().into(),
            model: config::get_model_path()?,
            lang: None,
            n_threads: None,
            verbose: false,
        };
        transcribe(args)?;

        Ok(())
    }
}
