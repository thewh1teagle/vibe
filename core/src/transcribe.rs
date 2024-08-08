use crate::audio;
use crate::config::TranscribeOptions;
use crate::transcript::{Segment, Transcript};
use eyre::{bail, eyre, Context, OptionExt, Result};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
pub use whisper_rs::SegmentCallbackData;
pub use whisper_rs::WhisperContext;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContextParameters};

type ProgressCallbackType = once_cell::sync::Lazy<Mutex<Option<Box<dyn Fn(i32) + Send + Sync>>>>;
static PROGRESS_CALLBACK: ProgressCallbackType = once_cell::sync::Lazy::new(|| Mutex::new(None));

pub fn create_context(model_path: &Path, gpu_device: Option<i32>) -> Result<WhisperContext> {
    whisper_rs::install_whisper_tracing_trampoline();
    tracing::debug!("open model...");
    if !model_path.exists() {
        bail!("whisper file doesn't exist")
    }
    let mut ctx_params = WhisperContextParameters::default();
    if !env!("CUDA_VERSION").is_empty() || !env!("ROCM_VERSION").is_empty() {
        // Nvidia or AMD
        ctx_params.use_gpu = true;
    }
    // set GPU device number from preference
    if let Some(gpu_device) = gpu_device {
        ctx_params.gpu_device = gpu_device;
    }
    tracing::debug!("gpu device: {:?}", ctx_params.gpu_device);
    tracing::debug!("use gpu: {:?}", ctx_params.use_gpu);
    let model_path = model_path.to_str().ok_or_eyre("can't convert model option to str")?;
    tracing::debug!("creating whisper context with model path {}", model_path);
    let ctx_unwind_result = catch_unwind(AssertUnwindSafe(|| {
        WhisperContext::new_with_params(model_path, ctx_params).context("failed to open model")
    }));
    match ctx_unwind_result {
        Err(error) => {
            bail!("create whisper context crash: {:?}", error)
        }
        Ok(ctx_result) => {
            let ctx = ctx_result?;
            tracing::debug!("created context successfuly");
            Ok(ctx)
        }
    }
}

pub fn create_normalized_audio(source: PathBuf) -> Result<PathBuf> {
    let out_path = tempfile::Builder::new()
        .suffix(".wav")
        .tempfile()?
        .into_temp_path()
        .to_path_buf();
    audio::normalize(source, out_path.clone())?;
    Ok(out_path)
}

fn setup_params(options: &TranscribeOptions) -> FullParams {
    let mut params = FullParams::new(SamplingStrategy::default());
    tracing::debug!("set language to {:?}", options.lang);

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
    params.set_print_progress(true);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_token_timestamps(true);

    if let Some(temperature) = options.temperature {
        tracing::debug!("setting temperature to {temperature}");
        params.set_temperature(temperature);
    }

    if let Some(max_text_ctx) = options.max_text_ctx {
        tracing::debug!("setting n_max_text_ctx to {}", max_text_ctx);
        params.set_n_max_text_ctx(max_text_ctx)
    }

    // handle args
    if let Some(init_prompt) = options.init_prompt.to_owned() {
        tracing::debug!("setting init prompt to {init_prompt}");
        params.set_initial_prompt(&init_prompt);
    }

    if let Some(n_threads) = options.n_threads {
        tracing::debug!("setting n threads to {n_threads}");
        params.set_n_threads(n_threads);
    }
    params
}

#[derive(Debug, Clone)]
pub struct DiarizeOptions {
    pub segment_model_path: String,
    pub embedding_model_path: String,
    pub threshold: f32,
    pub max_speakers: usize,
}

pub fn transcribe(
    ctx: &WhisperContext,
    options: &TranscribeOptions,
    progress_callback: Option<Box<dyn Fn(i32) + Send + Sync>>,
    new_segment_callback: Option<Box<dyn Fn(Segment)>>,
    abort_callback: Option<Box<dyn Fn() -> bool>>,
    diarize_options: Option<DiarizeOptions>,
) -> Result<Transcript> {
    tracing::debug!("Transcribe called with {:?}", options);

    if !PathBuf::from(options.path.clone()).exists() {
        bail!("audio file doesn't exist")
    }

    let out_path = create_normalized_audio(options.path.clone().into())?;
    tracing::debug!("out path is {}", out_path.display());
    let original_samples = audio::parse_wav_file(&out_path)?;

    let mut state = ctx.create_state().context("failed to create key")?;

    let mut params = setup_params(options);

    let mut segments = Vec::new();

    let st = std::time::Instant::now();
    if let Some(diarize_options) = diarize_options {
        tracing::debug!("Diarize enabled {:?}", diarize_options);
        params.set_single_segment(true);

        let diarize_segments =
            pyannote_rs::segment(&original_samples, 16000, diarize_options.segment_model_path).map_err(|e| eyre!("{:?}", e))?;
        let mut embedding_manager = pyannote_rs::EmbeddingManager::new(diarize_options.max_speakers);
        let mut extractor =
            pyannote_rs::EmbeddingExtractor::new(diarize_options.embedding_model_path).map_err(|e| eyre!("{:?}", e))?;
        for (i, diarize_segment) in diarize_segments.iter().enumerate() {
            if let Some(ref abort_callback) = abort_callback {
                if abort_callback() {
                    break;
                }
            }

            // whisper compatible. segment indices
            tracing::debug!("diarize segment: {} - {}", diarize_segment.start, diarize_segment.end);

            let mut samples = vec![0.0f32; diarize_segment.samples.len()];

            whisper_rs::convert_integer_to_float_audio(&diarize_segment.samples, &mut samples)?;
            state.full(params.clone(), &samples).context("failed to transcribe")?;

            let num_segments = state.full_n_segments().context("failed to get number of segments")?;
            tracing::debug!("found {} sentence segments", num_segments);

            tracing::debug!("looping segments...");

            if num_segments > 0 {
                let embedding_result: Vec<f32> = match extractor.compute(&diarize_segment.samples) {
                    Ok(result) => result.collect(),
                    Err(error) => {
                        tracing::error!("error: {:?}", error);
                        tracing::debug!(
                            "start = {:.2}, end = {:.2}, speaker = ?",
                            diarize_segment.start,
                            diarize_segment.end
                        );
                        continue; // Skip to the next segment
                    }
                };
                // Find the speaker
                let speaker = if embedding_manager.get_all_speakers().len() == diarize_options.max_speakers {
                    embedding_manager
                        .get_best_speaker_match(embedding_result)
                        .map(|r| r.to_string())
                        .unwrap_or("?".into())
                } else {
                    embedding_manager
                        .search_speaker(embedding_result, diarize_options.threshold)
                        .map(|r| r.to_string())
                        .unwrap_or("?".into())
                };

                // convert to whisper comptible timestamps
                let start = 100 * (diarize_segment.start as i64);
                let stop = 100 * (diarize_segment.end as i64);
                let text = state.full_get_segment_text_lossy(0).context("failed to get segment")?;
                let segment = Segment {
                    speaker: Some(speaker),
                    start,
                    stop,
                    text,
                };
                segments.push(segment.clone());

                if let Some(ref new_segment_callback) = new_segment_callback {
                    new_segment_callback(segment);
                }
                if let Some(ref progress_callback) = progress_callback {
                    tracing::debug!("progress: {} * {} / 100", i, diarize_segments.len());
                    let progress = ((i + 1) as f64 / diarize_segments.len() as f64 * 100.0) as i32;
                    tracing::debug!("progress diarize: {}", progress);
                    progress_callback(progress);
                }
            }
        }
    } else {
        if let Some(callback) = progress_callback {
            let mut guard = PROGRESS_CALLBACK.lock().map_err(|e| eyre!("{:?}", e))?;
            let internal_progress_callback = move |progress: i32| callback(progress);
            *guard = Some(Box::new(internal_progress_callback));
        }
        let mut samples = vec![0.0f32; original_samples.len()];

        whisper_rs::convert_integer_to_float_audio(&original_samples, &mut samples)?;

        if let Some(new_segment_callback) = new_segment_callback {
            let internal_new_segmet_callback = move |segment: SegmentCallbackData| {
                new_segment_callback(Segment {
                    start: segment.start_timestamp,
                    stop: segment.end_timestamp,
                    speaker: None,
                    text: segment.text,
                })
            };
            params.set_segment_callback_safe_lossy(internal_new_segmet_callback);
        }

        if let Some(abort_callback) = abort_callback {
            params.set_abort_callback_safe(abort_callback);
        }

        if PROGRESS_CALLBACK.lock().map_err(|e| eyre!("{:?}", e))?.as_ref().is_some() {
            params.set_progress_callback_safe(|progress| {
                // using move here lead to crash
                tracing::debug!("progress callback {}", progress);
                match PROGRESS_CALLBACK.lock() {
                    Ok(callback_guard) => {
                        if let Some(progress_callback) = callback_guard.as_ref() {
                            progress_callback(progress);
                        }
                    }
                    Err(e) => {
                        tracing::error!("Failed to lock PROGRESS_CALLBACK: {:?}", e);
                    }
                }
            });
        }

        tracing::debug!("set start time...");

        tracing::debug!("setting state full...");
        state.full(params, &samples).context("failed to transcribe")?;
        let _et = std::time::Instant::now();

        tracing::debug!("getting segments count...");
        let num_segments = state.full_n_segments().context("failed to get number of segments")?;
        if num_segments == 0 {
            bail!("no segements found!")
        }
        tracing::debug!("found {} sentence segments", num_segments);

        tracing::debug!("looping segments...");
        for s in 0..num_segments {
            let text = state.full_get_segment_text_lossy(s).context("failed to get segment")?;
            let start = state.full_get_segment_t0(s).context("failed to get start timestamp")?;
            let stop = state.full_get_segment_t1(s).context("failed to get end timestamp")?;
            segments.push(Segment {
                text,
                start,
                stop,
                speaker: None,
            });
        }
    }

    #[allow(unused_mut)]
    let mut transcript = Transcript {
        segments,
        processing_time_sec: Instant::now().duration_since(st).as_secs(),
    };

    // cleanup
    std::fs::remove_file(out_path)?;

    Ok(transcript)
}
