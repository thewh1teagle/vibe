use crate::audio;
use crate::config::TranscribeOptions;
use crate::transcript::{Segment, Transcript};
use eyre::{bail, Context, Ok, OptionExt, Result};
use std::path::Path;
use std::sync::Mutex;
use std::time::Instant;
pub use whisper_rs::SegmentCallbackData;
pub use whisper_rs::WhisperContext;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContextParameters};
type ProgressCallbackType = once_cell::sync::Lazy<Mutex<Option<Box<dyn Fn(i32) + Send + Sync>>>>;
static PROGRESS_CALLBACK: ProgressCallbackType = once_cell::sync::Lazy::new(|| Mutex::new(None));

pub fn create_context(model_path: &Path) -> Result<WhisperContext> {
    log::debug!("open model...");
    if !model_path.exists() {
        bail!("whisper file doesn't exist")
    }
    let ctx = WhisperContext::new_with_params(
        model_path.to_str().ok_or_eyre("can't convert model option to str")?,
        WhisperContextParameters::default(),
    )
    .context("failed to open model")?;
    Ok(ctx)
}

pub fn transcribe(
    ctx: &WhisperContext,
    options: &TranscribeOptions,
    progress_callback: Option<Box<dyn Fn(i32) + Send + Sync>>,
    new_segment_callback: Option<Box<dyn Fn(whisper_rs::SegmentCallbackData)>>,
    abort_callback: Option<Box<dyn Fn() -> bool>>,
) -> Result<Transcript> {
    log::debug!("Transcribe called with {:?}", options);

    if !options.path.clone().exists() {
        bail!("audio file doesn't exist")
    }

    if let Some(callback) = progress_callback {
        let mut guard = PROGRESS_CALLBACK.lock().unwrap();
        *guard = Some(Box::new(callback));
    }

    let out_path = tempfile::Builder::new()
        .suffix(".wav")
        .tempfile()?
        .into_temp_path()
        .to_path_buf();
    audio::normalize(options.path.clone(), out_path.clone())?;
    let original_samples = audio::parse_wav_file(&out_path)?;
    let mut samples = vec![0.0f32; original_samples.len()];
    whisper_rs::install_whisper_log_trampoline();
    whisper_rs::convert_integer_to_float_audio(&original_samples, &mut samples)?;
    let mut state = ctx.create_state().context("failed to create key")?;

    let mut params = FullParams::new(SamplingStrategy::default());
    log::debug!("set language to {:?}", options.lang);

    if let Some(true) = options.word_timestamps {
        params.set_token_timestamps(true);
        params.set_split_on_word(true);
        params.set_max_len(options.max_sentence_len.unwrap_or(1));
    }

    if let Some(true) = options.translate {
        params.set_translate(true);
    }
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
        log::debug!("setting temperature to {temperature}");
        params.set_temperature(temperature);
    }

    if let Some(max_text_ctx) = options.max_text_ctx {
        log::debug!("setting n_max_text_ctx to {}", max_text_ctx);
        params.set_n_max_text_ctx(max_text_ctx)
    }

    // handle args
    if let Some(init_prompt) = options.init_prompt.to_owned() {
        log::debug!("setting init prompt to {init_prompt}");
        params.set_initial_prompt(&init_prompt);
    }

    if let Some(n_threads) = options.n_threads {
        log::debug!("setting n threads to {n_threads}");
        params.set_n_threads(n_threads);
    }

    if let Some(new_segment_callback) = new_segment_callback {
        params.set_segment_callback_safe_lossy(new_segment_callback);
    }

    if let Some(abort_callback) = abort_callback {
        params.set_abort_callback_safe(abort_callback);
    }

    if PROGRESS_CALLBACK.lock().unwrap().as_ref().is_some() {
        params.set_progress_callback_safe(|progress| {
            // using move here lead to crash
            log::debug!("progress callback {}", progress);
            if let Some(progress_callback) = PROGRESS_CALLBACK.lock().unwrap().as_ref() {
                progress_callback(progress);
            }
        });
    }

    log::debug!("set start time...");
    let st = std::time::Instant::now();
    log::debug!("setting state full...");
    state.full(params, &samples).context("failed to transcribe")?;
    let _et = std::time::Instant::now();

    let mut segments = Vec::new();

    log::debug!("getting segments count...");
    let num_segments = state.full_n_segments().context("failed to get number of segments")?;
    if num_segments == 0 {
        bail!("no segements found!")
    }
    log::debug!("found {} sentence segments", num_segments);

    log::debug!("looping segments...");
    for s in 0..num_segments {
        let text = state.full_get_segment_text_lossy(s).context("failed to get segment")?;
        let start = state.full_get_segment_t0(s).context("failed to get start timestamp")?;
        let stop = state.full_get_segment_t1(s).context("failed to get end timestamp")?;
        segments.push(Segment { text, start, stop });
    }

    // cleanup
    std::fs::remove_file(out_path)?;

    Ok(Transcript {
        segments,
        processing_time: Instant::now().duration_since(st),
    })
}

#[cfg(test)]
mod tests {
    use crate::{audio, config};

    use super::*;
    use eyre::Result;
    use std::fs;
    use tempfile::tempdir;

    fn init() {
        let _ = env_logger::builder().is_test(true).try_init();
    }

    #[test]
    fn test_audio_conversion() -> Result<()> {
        init();
        log::debug!("test");
        // Create a temporary directory to store input and output files.
        let temp_dir = tempdir()?;
        let input_file_path = temp_dir.path().join("input.mp3");
        let output_file_path = temp_dir.path().join("output.wav");

        // Copy a sample input file to the temporary directory.
        log::debug!("copying from {} to {}", "src/audio/test_audio.wav", input_file_path.display());
        fs::copy("src/audio/test_audio.wav", &input_file_path)?;
        audio::normalize(input_file_path.clone(), output_file_path.clone())?;
        log::debug!("check output at {}", output_file_path.display());
        let args = &config::TranscribeOptions {
            path: input_file_path
                .to_str()
                .ok_or_eyre("cant convert path to str")?
                .to_owned()
                .into(),
            lang: None,
            n_threads: None,
            verbose: false,
            init_prompt: None,
            temperature: None,
            translate: None,
            max_text_ctx: None,
            word_timestamps: None,
            max_sentence_len: None,
        };
        let ctx = create_context(Path::new(&config::get_model_path().unwrap())).unwrap();
        transcribe(&ctx, args, None, None, None)?;

        Ok(())
    }
}
