//! Speaker diarization with NVIDIA Nemotron-3-Diarization, in-process on GGML.
//!
//! The GGUF comes from `scripts/export.py`. The pipeline mirrors the HF offline
//! forward: log-mel (`mel`), feature stacking (`graph::embed`), then chunks of
//! encoder frames that each attend to the speaker cache and FIFO (`cache`)
//! through a 31-layer RoPE transformer and the speaker head (`graph::StepGraph`).
//!
//! Set `RUST_LOG=nemotron_diarize_rs=debug` (or `trace`) to see per-stage timings.

mod cache;
mod graph;
mod mel;
mod model;
mod runtime;
mod segment;

use std::path::{Path, PathBuf};
use std::time::Instant;

pub use ggml_rs_sys as sys;
pub use model::HParams;
pub use segment::Segment;

use cache::SpeakerCache;
use graph::StepGraph;
use mel::{MelConfig, MelFrontend};
use model::Model;
use runtime::Runtime;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("path contains an interior NUL")]
    InvalidPath,
    #[error("failed to load GGUF model {0}")]
    Load(String),
    #[error("unsupported model architecture {0:?}; expected {arch:?}", arch = model::ARCHITECTURE)]
    UnsupportedArchitecture(String),
    #[error("missing GGUF metadata key {0}")]
    MissingMetadata(&'static str),
    #[error("invalid GGUF metadata {key}: {message}")]
    InvalidMetadata { key: &'static str, message: String },
    #[error("model is missing tensor {0}")]
    MissingTensor(String),
    #[error("GGML operation failed: {0}")]
    Ggml(&'static str),
    #[error("failed to read audio {path}: {message}")]
    Audio { path: PathBuf, message: String },
}

pub type Result<T> = std::result::Result<T, Error>;

/// Per-frame speaker activity, one frame per `frame_seconds` (10 ms).
#[derive(Debug, Clone)]
pub struct Probabilities {
    /// Row-major `[num_frames, num_speakers]`, sigmoid probabilities.
    pub data: Vec<f32>,
    pub num_frames: usize,
    /// Frames from this index on are padding past the end of the audio.
    pub num_valid: usize,
    pub num_speakers: usize,
    pub frame_seconds: f64,
}

pub struct Diarizer {
    // Field order is drop order: graphs, then the runtime, then the weights they reference.
    step: Option<StepGraph>,
    runtime: Runtime,
    mel: MelFrontend,
    model: Model,
    threshold: f32,
}

impl Diarizer {
    /// Loads a GGUF exported by `scripts/export.py`.
    pub fn new(model_path: impl AsRef<Path>) -> Result<Self> {
        let model = Model::load(model_path.as_ref())?;
        let runtime = Runtime::new(model.device_backend())?;
        let h = &model.hparams;
        let mel = MelFrontend::new(MelConfig {
            sample_rate: h.sample_rate,
            num_mels: h.num_mels,
            n_fft: h.n_fft,
            win_length: h.win_length,
            hop_length: h.hop_length,
            preemphasis: h.preemphasis,
        });
        tracing::info!(backend = runtime.name(), "diarizer ready");
        Ok(Self {
            step: None,
            runtime,
            mel,
            model,
            threshold: 0.5,
        })
    }

    /// Speaker probability above which a frame counts as that speaker's speech. Defaults to 0.5.
    pub fn with_threshold(mut self, threshold: f32) -> Self {
        self.threshold = threshold;
        self
    }

    pub fn hparams(&self) -> &HParams {
        &self.model.hparams
    }

    pub fn sample_rate(&self) -> u32 {
        self.model.hparams.sample_rate as u32
    }

    /// Diarizes a WAV file at the model's sample rate; multichannel audio is averaged to mono.
    pub fn diarize(&mut self, wav_path: impl AsRef<Path>) -> Result<Vec<Segment>> {
        let samples = read_wav(wav_path.as_ref(), self.sample_rate())?;
        self.diarize_samples(&samples)
    }

    /// Diarizes mono samples at the model's sample rate.
    pub fn diarize_samples(&mut self, samples: &[f32]) -> Result<Vec<Segment>> {
        let probs = self.probabilities(samples)?;
        let segments = segment::extract(
            &probs.data,
            probs.num_speakers,
            probs.num_valid,
            probs.frame_seconds,
            self.threshold,
        );
        let speakers = segments.iter().map(|s| s.speaker_id + 1).max().unwrap_or(0);
        tracing::info!(segments = segments.len(), speakers, "segments extracted");
        Ok(segments)
    }

    /// Runs the model over a whole recording (offline mode) and returns per-frame speaker probabilities.
    pub fn probabilities(&mut self, samples: &[f32]) -> Result<Probabilities> {
        let h = self.model.hparams.clone();
        let audio_seconds = samples.len() as f64 / h.sample_rate as f64;
        let _span = tracing::info_span!("diarize", audio_s = format_args!("{audio_seconds:.2}")).entered();
        let started = Instant::now();
        let frame_seconds = h.hop_length as f64 / h.sample_rate as f64;

        let features = self.mel.compute(samples);
        let mel_ms = started.elapsed().as_secs_f64() * 1e3;
        if features.num_valid == 0 {
            tracing::warn!(samples = samples.len(), "audio shorter than one frame");
            return Ok(Probabilities {
                data: vec![0.0; features.num_frames * h.num_speakers],
                num_frames: features.num_frames,
                num_valid: 0,
                num_speakers: h.num_speakers,
                frame_seconds,
            });
        }

        let embed_started = Instant::now();
        let embeds = graph::embed(&self.model, &self.runtime, &features.data, features.num_frames)?;
        let embed_ms = embed_started.elapsed().as_secs_f64() * 1e3;
        let num_embeds = embeds.len() / h.hidden_size;
        // An encoder frame is valid when its first mel frame is.
        let embed_valid = (0..num_embeds)
            .map(|i| i * h.subsampling_factor < features.num_valid)
            .collect::<Vec<_>>();

        let mut cache = SpeakerCache::offline(&h);
        let factor_speakers = h.subsampling_factor * h.num_speakers;
        let mut logits = Vec::with_capacity(num_embeds * factor_speakers);
        let (mut build_ms, mut compute_ms, mut cache_ms) = (0.0, 0.0, 0.0);
        let num_chunks = num_embeds.div_ceil(h.chunk_length);

        for (index, start) in (0..num_embeds).step_by(h.chunk_length).enumerate() {
            let chunk_started = Instant::now();
            let end = (start + h.chunk_length).min(num_embeds);
            let num_chunk_frames = end - start;
            let chunk_end = (end + h.chunk_right_context).min(num_embeds);
            let cached = cache.num_cache_frames() + cache.num_fifo_frames();
            let frames = cached + chunk_end - start;

            let mut step_embeds = Vec::with_capacity(frames * h.hidden_size);
            step_embeds.extend(cache.prefix());
            step_embeds.extend_from_slice(&embeds[start * h.hidden_size..chunk_end * h.hidden_size]);
            let mut valid = vec![true; cached];
            valid.extend_from_slice(&embed_valid[start..chunk_end]);

            let reused = self.step.as_ref().is_some_and(|step| step.frames == frames);
            if !reused {
                let build_started = Instant::now();
                self.step = None;
                self.step = Some(StepGraph::build(&self.model, frames)?);
                build_ms += build_started.elapsed().as_secs_f64() * 1e3;
            }
            let compute_started = Instant::now();
            let step_logits = self
                .step
                .as_mut()
                .expect("step graph")
                .run(&self.runtime, &step_embeds, &valid)?;
            let step_compute_ms = compute_started.elapsed().as_secs_f64() * 1e3;
            compute_ms += step_compute_ms;

            let cache_started = Instant::now();
            cache.update(
                &step_embeds,
                &step_logits,
                &valid,
                &self.model.silence_embeds,
                num_chunk_frames,
            );
            let step_cache_ms = cache_started.elapsed().as_secs_f64() * 1e3;
            cache_ms += step_cache_ms;

            logits.extend_from_slice(&step_logits[cached * factor_speakers..(cached + num_chunk_frames) * factor_speakers]);
            tracing::debug!(
                chunk = index + 1,
                of = num_chunks,
                start,
                chunk_frames = num_chunk_frames,
                lookahead = chunk_end - end,
                cached,
                step_frames = frames,
                graph_reused = reused,
                compute_ms = step_compute_ms,
                cache_ms = step_cache_ms,
                total_ms = chunk_started.elapsed().as_secs_f64() * 1e3,
                "chunk"
            );
        }

        // Without look-ahead the last encoder frame may be stacking padding: keep the mel frame count.
        logits.truncate(features.num_frames * h.num_speakers);
        let data = logits.into_iter().map(|x| 1.0 / (1.0 + (-x).exp())).collect::<Vec<_>>();

        let total_s = started.elapsed().as_secs_f64();
        tracing::info!(
            backend = self.runtime.name(),
            enc_frames = num_embeds,
            chunks = num_chunks,
            cache_compressions = cache.compressions,
            mel_ms,
            embed_ms,
            build_ms,
            compute_ms,
            cache_ms,
            total_ms = total_s * 1e3,
            rtf = total_s / audio_seconds.max(1e-9),
            x_realtime = audio_seconds / total_s.max(1e-9),
            "diarization done"
        );
        Ok(Probabilities {
            data,
            num_frames: features.num_frames,
            num_valid: features.num_valid,
            num_speakers: h.num_speakers,
            frame_seconds,
        })
    }
}

fn read_wav(path: &Path, sample_rate: u32) -> Result<Vec<f32>> {
    let started = Instant::now();
    let error = |message: String| Error::Audio {
        path: path.to_path_buf(),
        message,
    };
    let mut reader = hound::WavReader::open(path).map_err(|e| error(e.to_string()))?;
    let spec = reader.spec();
    if spec.sample_rate != sample_rate {
        return Err(error(format!(
            "sample rate {} Hz, expected {sample_rate} Hz",
            spec.sample_rate
        )));
    }
    let interleaved = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().collect::<std::result::Result<Vec<_>, _>>(),
        hound::SampleFormat::Int => {
            let scale = 1.0 / (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader
                .samples::<i32>()
                .map(|sample| sample.map(|value| value as f32 * scale))
                .collect()
        }
    }
    .map_err(|e| error(e.to_string()))?;
    let channels = spec.channels.max(1) as usize;
    let samples = if channels == 1 {
        interleaved
    } else {
        interleaved
            .chunks_exact(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect()
    };
    tracing::debug!(
        path = %path.display(),
        channels,
        samples = samples.len(),
        ms = started.elapsed().as_secs_f64() * 1e3,
        "wav read"
    );
    Ok(samples)
}
