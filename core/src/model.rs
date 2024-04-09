use std::sync::Mutex;
use std::time::Instant;

use anyhow::{bail, Context, Ok, Result};
use log::debug;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::audio;
use crate::config::ModelArgs;
use crate::transcript::{Transcript, Utternace};
use once_cell;

static ON_PROGRESS_CHANGE: once_cell::sync::Lazy<Mutex<Option<Box<dyn Fn(i32) + Send + Sync>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(None));

pub fn transcribe(options: &ModelArgs, on_progress_change: Option<fn(i32)>) -> Result<Transcript> {
    debug!("Transcribe called with {:?}", options);
    if !options.model.exists() {
        bail!("whisper file doesn't exist")
    }

    if !options.path.clone().exists() {
        bail!("audio file doesn't exist")
    }
    if let Some(callback) = on_progress_change {
        let mut guard = ON_PROGRESS_CHANGE.lock().unwrap();
        *guard = Some(Box::new(callback));
    }

    let out_path = tempfile::Builder::new()
        .suffix(".wav")
        .tempfile()?
        .into_temp_path()
        .to_path_buf();
    audio::normalize(options.path.clone(), out_path.clone(), "0".to_owned())?;
    let original_samples = audio::parse_wav_file(&out_path)?;
    let mut samples = vec![0.0f32; original_samples.len()];
    whisper_rs::convert_integer_to_float_audio(&original_samples, &mut samples)?;

    debug!("open model...");
    let ctx = WhisperContext::new_with_params(
        &options.model.to_str().context("can't convert model option to str")?,
        WhisperContextParameters::default(),
    )
    .context("failed to open model")?;
    let mut state = ctx.create_state().context("failed to create key")?;

    let mut params = FullParams::new(SamplingStrategy::default());
    debug!("set language to {:?}", options.lang);
    if options.lang.is_some() {
        params.set_language(options.lang.as_deref());
    }
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_token_timestamps(true);

    if let Some(temperature) = options.temperature {
        debug!("setting temperature to {temperature}");
        params.set_temperature(temperature);
    }

    // handle args
    if let Some(init_prompt) = options.init_prompt.to_owned() {
        debug!("setting init prompt to {init_prompt}");
        params.set_initial_prompt(&init_prompt);
    }

    if let Some(n_threads) = options.n_threads {
        debug!("setting n threads to {n_threads}");
        params.set_n_threads(n_threads);
    }

    if let Some(_) = ON_PROGRESS_CHANGE.lock().unwrap().as_ref() {
        params.set_progress_callback_safe(|progress| {
            debug!("progress callback {}", progress);
            if let Some(callback) = ON_PROGRESS_CHANGE.lock().unwrap().as_ref() {
                callback(progress);
            }
        });
    }

    debug!("set start time...");
    let st = std::time::Instant::now();
    debug!("setting state full...");
    state.full(params, &samples).context("failed to transcribe")?;
    let _et = std::time::Instant::now();

    debug!("getting segments count...");
    let num_segments = state.full_n_segments().context("failed to get number of segments")?;
    if num_segments == 0 {
        bail!("no segements found!")
    }
    debug!("found {} segments", num_segments);
    let mut utterances = Vec::new();
    debug!("looping segments...");
    for s in 0..num_segments {
        let text = state.full_get_segment_text_lossy(s).context("failed to get segment")?;
        let start = state.full_get_segment_t0(s).context("failed to get start timestamp")?;
        let stop = state.full_get_segment_t1(s).context("failed to get end timestamp")?;

        utterances.push(Utternace { text, start, stop });
    }

    // cleanup
    std::fs::remove_file(out_path)?;

    Ok(Transcript {
        utterances,
        processing_time: Instant::now().duration_since(st),
    })
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
            path: input_file_path
                .to_str()
                .context("cant convert path to str")?
                .to_owned()
                .into(),
            model: config::get_model_path()?,
            lang: None,
            n_threads: None,
            verbose: false,
            init_prompt: None,
            temperature: None,
        };
        transcribe(args, None)?;

        Ok(())
    }
}
