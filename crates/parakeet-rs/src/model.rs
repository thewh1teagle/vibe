//! The loaded model and what it can do: transcribe a chunk, run the encoder,
//! and walk a long recording segment by segment.
//!
//! Loading a GGUF into one of these — metadata, tensor catalog, GPU upload —
//! lives in [`crate::load`].

use std::time::Instant;

use crate::encoder::{build_encoder, build_pre_encode, full_mask, positional_embedding};
use crate::load::lookup_tensor;
use crate::runtime::Graph;
use crate::MelFeatures;
use crate::{sys, Error, Result, Tokenizer};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelInfo {
    pub architecture: String,
    pub variant: String,
    pub head_kind: String,
    pub languages: Vec<String>,
    pub language_detection: bool,
    pub tensor_count: usize,
    pub encoder_layers: i32,
    pub encoder_dimension: i32,
    pub encoder_heads: i32,
    pub encoder_uses_bias: bool,
    pub encoder_xscaling: bool,
    pub encoder_conv_kernel: i32,
    pub vocabulary_size: i32,
    pub predictor_hidden: i32,
    pub predictor_layers: i32,
    pub joint_hidden: i32,
    pub joint_extra_outputs: i32,
    pub joint_activation: String,
    pub tdt_durations: Vec<i32>,
    pub tdt_max_symbols: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Transcription {
    pub text: String,
    pub tokens: Vec<crate::Token>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct LongFormTranscription {
    pub segments: Vec<Transcription>,
}

impl LongFormTranscription {
    pub fn text(&self) -> String {
        self.segments
            .iter()
            .map(|segment| segment.text.trim())
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

/// Loaded GGUF metadata and tensor storage.
///
/// The GGML context owns the mapped tensor data. It must outlive every tensor
/// pointer used by the inference graph, so it is kept beside the GGUF context.
pub struct Model {
    pub(crate) gguf: *mut sys::gguf_context,
    pub(crate) weights: *mut sys::ggml_context,
    pub(crate) info: ModelInfo,
    pub(crate) tokenizer: Tokenizer,
    pub(crate) device: Option<DeviceWeights>,
}
pub(crate) struct DeviceWeights {
    pub(crate) ctx: *mut sys::ggml_context,
    pub(crate) buffer: sys::ggml_backend_buffer_t,
    pub(crate) backend: sys::ggml_backend_t,
}

impl Drop for DeviceWeights {
    fn drop(&mut self) {
        unsafe {
            sys::ggml_backend_buffer_free(self.buffer);
            sys::ggml_free(self.ctx);
            sys::ggml_backend_free(self.backend);
        }
    }
}
impl Drop for Model {
    fn drop(&mut self) {
        unsafe {
            sys::ggml_free(self.weights);
            sys::gguf_free(self.gguf);
        }
    }
}

unsafe impl Send for Model {}

impl Model {
    pub fn info(&self) -> &ModelInfo {
        &self.info
    }

    pub fn tokenizer(&self) -> &Tokenizer {
        &self.tokenizer
    }

    fn validate_language(&self, language: &str) -> Result<()> {
        if language == "auto" || self.info.languages.iter().any(|candidate| candidate == language) {
            Ok(())
        } else {
            Err(Error::UnsupportedLanguage(language.to_owned()))
        }
    }

    fn transcribe_chunk(&self, samples: &[f32], language: &str) -> Result<Transcription> {
        self.validate_language(language)?;
        let started = Instant::now();
        let mel_started = Instant::now();
        let features = crate::MelFrontend::new(crate::MelConfig::default())?.compute(samples)?;
        eprintln!(
            "[parakeet][chunk] mel_ms={} samples={} frames={}",
            mel_started.elapsed().as_millis(),
            samples.len(),
            features.num_frames
        );
        let encoder_started = Instant::now();
        let (encoded, shape) = self.encode(&features)?;
        eprintln!(
            "[parakeet][chunk] encoder_ms={} frames={}",
            encoder_started.elapsed().as_millis(),
            shape[1]
        );
        let decoder_started = Instant::now();
        let tokens = self.decode(&encoded, shape[1] as usize)?;
        eprintln!(
            "[parakeet][chunk] decoder_ms={} tokens={} total_ms={}",
            decoder_started.elapsed().as_millis(),
            tokens.len(),
            started.elapsed().as_millis()
        );
        let ids = tokens.iter().map(|token| token.id).collect::<Vec<_>>();
        Ok(Transcription {
            text: self.tokenizer.decode_clean(&ids),
            tokens,
        })
    }

    pub fn transcribe(&self, vad: &mut vad_rs::Vad, samples: &[f32], language: &str) -> Result<LongFormTranscription> {
        self.transcribe_with(vad, samples, language, || false, |_| {}, |_| {})
    }

    pub fn transcribe_with(
        &self,
        vad: &mut vad_rs::Vad,
        samples: &[f32],
        language: &str,
        mut should_abort: impl FnMut() -> bool,
        mut on_segment: impl FnMut(&Transcription),
        mut on_progress: impl FnMut(i32),
    ) -> Result<LongFormTranscription> {
        let all_started = Instant::now();
        let vad_started = Instant::now();
        let ranges = vad.segments(samples).map_err(|error| Error::Vad(error.to_string()))?;
        eprintln!(
            "[parakeet][vad] elapsed_ms={} audio_s={:.3} chunks={}",
            vad_started.elapsed().as_millis(),
            samples.len() as f64 / 16000.0,
            ranges.len()
        );
        let total_samples = ranges
            .iter()
            .map(|range| range.end_sample.saturating_sub(range.start_sample))
            .sum::<usize>()
            .max(1);
        let mut processed_samples = 0;
        on_progress(0);
        let mut result = LongFormTranscription {
            segments: Vec::with_capacity(ranges.len()),
        };
        let mut last_frame = None;
        for (chunk_index, range) in ranges.into_iter().enumerate() {
            if should_abort() {
                return Err(Error::Aborted);
            }
            eprintln!(
                "[parakeet][vad] chunk={} start={} end={} duration_s={:.3}",
                chunk_index,
                range.start_sample,
                range.end_sample,
                (range.end_sample - range.start_sample) as f64 / 16000.0
            );
            let mut transcription = self.transcribe_chunk(&samples[range.start_sample..range.end_sample], language)?;
            let frame_offset = range.start_sample / 1280;
            for token in &mut transcription.tokens {
                token.frame += frame_offset;
            }
            if let Some(frame) = last_frame {
                transcription.tokens.retain(|token| token.frame > frame);
                let ids = transcription.tokens.iter().map(|token| token.id).collect::<Vec<_>>();
                transcription.text = self.tokenizer.decode_clean(&ids);
            }
            last_frame = transcription.tokens.last().map(|token| token.frame).or(last_frame);
            for segment in crate::segment::split_sentences(transcription.tokens, &self.tokenizer) {
                on_segment(&segment);
                result.segments.push(segment);
            }
            processed_samples += range.end_sample.saturating_sub(range.start_sample);
            on_progress(((processed_samples * 100) / total_samples).min(100) as i32);
        }
        eprintln!(
            "[parakeet][long-form] total_ms={} segments={} rtf={:.4}",
            all_started.elapsed().as_millis(),
            result.segments.len(),
            all_started.elapsed().as_secs_f64() / (samples.len() as f64 / 16000.0).max(0.001)
        );
        Ok(result)
    }

    pub fn encode_stem(&self, features: &MelFeatures) -> Result<(Vec<f32>, [i64; 3])> {
        unsafe {
            let runtime = crate::runtime::accelerated_runtime(self.device.as_ref().map(|device| device.backend))?;
            let mut graph = Graph::new()?;
            let input = sys::ggml_new_tensor_4d(
                graph.ctx,
                sys::ggml_type_GGML_TYPE_F32,
                features.num_frames as i64,
                features.num_mels as i64,
                1,
                1,
            );
            let output = build_pre_encode(graph.ctx, self, input);
            graph.output(output);
            runtime.execute(&mut graph, &[(input, &features.data)])?;
            let shape = [(*output).ne[0], (*output).ne[1], (*output).ne[2]];
            let count = shape.iter().product::<i64>() as usize;
            let mut data = vec![0.0f32; count];
            sys::ggml_backend_tensor_get(output, data.as_mut_ptr().cast(), 0, data.len() * 4);
            Ok((data, shape))
        }
    }

    pub fn encode(&self, features: &MelFeatures) -> Result<(Vec<f32>, [i64; 3])> {
        unsafe {
            let runtime = crate::runtime::accelerated_runtime(self.device.as_ref().map(|device| device.backend))?;
            let mut graph = Graph::new()?;
            let input = sys::ggml_new_tensor_4d(
                graph.ctx,
                sys::ggml_type_GGML_TYPE_F32,
                features.num_frames as i64,
                features.num_mels as i64,
                1,
                1,
            );
            let built = build_encoder(graph.ctx, self, input, self.device.is_none());
            graph.output(built.output);
            let time = (*built.output).ne[1] as usize;
            let positions = positional_embedding(self.info.encoder_dimension as usize, time);
            let mask = full_mask(time);
            runtime.execute(
                &mut graph,
                &[(input, &features.data), (built.position, &positions), (built.mask, &mask)],
            )?;
            let shape = [(*built.output).ne[0], (*built.output).ne[1], (*built.output).ne[2]];
            let count = shape.iter().product::<i64>() as usize;
            let mut data = vec![0.0f32; count];
            sys::ggml_backend_tensor_get(built.output, data.as_mut_ptr().cast(), 0, data.len() * 4);
            let min = data.iter().copied().fold(f32::INFINITY, f32::min);
            let max = data.iter().copied().fold(f32::NEG_INFINITY, f32::max);
            let mean = data.iter().sum::<f32>() / data.len().max(1) as f32;
            let rms = (data.iter().map(|value| value * value).sum::<f32>() / data.len().max(1) as f32).sqrt();
            eprintln!("[parakeet][encoder] shape={shape:?} min={min:.6} max={max:.6} mean={mean:.6} rms={rms:.6}");
            Ok((data, shape))
        }
    }

    pub(crate) fn tensor(&self, name: &str) -> Option<*mut sys::ggml_tensor> {
        if let Some(device) = &self.device {
            return lookup_tensor(device.ctx, name);
        }
        self.cpu_tensor(name)
    }

    pub(crate) fn cpu_tensor(&self, name: &str) -> Option<*mut sys::ggml_tensor> {
        lookup_tensor(self.weights, name)
    }
}
