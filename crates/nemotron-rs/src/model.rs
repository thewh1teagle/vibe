use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::path::Path;
use std::ptr;

use crate::encoder::{build_encoder, build_pre_encode, chunk_mask, positional_embedding};
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
    pub vocabulary_size: i32,
    pub prompt_count: i32,
    pub predictor_hidden: i32,
    pub predictor_layers: i32,
    pub joint_hidden: i32,
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
    gguf: *mut sys::gguf_context,
    weights: *mut sys::ggml_context,
    info: ModelInfo,
    tokenizer: Tokenizer,
    prompts: HashMap<String, usize>,
    auto_prompt: usize,
    device: Option<DeviceWeights>,
}

struct DeviceWeights {
    ctx: *mut sys::ggml_context,
    buffer: sys::ggml_backend_buffer_t,
    backend: sys::ggml_backend_t,
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

unsafe impl Send for Model {}

impl Model {
    /// Read model metadata without allocating or uploading tensor data.
    pub fn metadata(path: impl AsRef<Path>) -> Result<ModelInfo> {
        let path = CString::new(path.as_ref().to_string_lossy().as_bytes()).map_err(|_| Error::InvalidPath)?;
        let mut weights = ptr::null_mut();
        let gguf = unsafe {
            sys::gguf_init_from_file(
                path.as_ptr(),
                sys::gguf_init_params {
                    no_alloc: true,
                    ctx: &mut weights,
                },
            )
        };
        if gguf.is_null() {
            return Err(Error::Load(path.to_string_lossy().into_owned()));
        }
        let result = unsafe { read_info(gguf) };
        unsafe {
            if !weights.is_null() {
                sys::ggml_free(weights);
            }
            sys::gguf_free(gguf);
        }
        result
    }

    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let path = CString::new(path.as_ref().to_string_lossy().as_bytes()).map_err(|_| Error::InvalidPath)?;
        let mut weights = ptr::null_mut();
        let gguf = unsafe {
            sys::gguf_init_from_file(
                path.as_ptr(),
                sys::gguf_init_params {
                    no_alloc: false,
                    ctx: &mut weights,
                },
            )
        };
        if gguf.is_null() || weights.is_null() {
            if !gguf.is_null() {
                unsafe { sys::gguf_free(gguf) };
            }
            return Err(Error::Load(path.to_string_lossy().into_owned()));
        }

        let loaded = match unsafe {
            read_info(gguf).and_then(|info| Tokenizer::load(gguf).and_then(|tok| read_prompts(gguf).map(|p| (info, tok, p))))
        } {
            Ok(loaded) => loaded,
            Err(error) => {
                unsafe {
                    sys::ggml_free(weights);
                    sys::gguf_free(gguf);
                }
                return Err(error);
            }
        };
        let (info, tokenizer, (prompts, auto_prompt)) = loaded;
        if info.architecture != "parakeet" {
            unsafe {
                sys::ggml_free(weights);
                sys::gguf_free(gguf);
            }
            return Err(Error::UnsupportedArchitecture(info.architecture));
        }
        if info.head_kind != "rnnt" {
            unsafe {
                sys::ggml_free(weights);
                sys::gguf_free(gguf);
            }
            return Err(Error::UnsupportedHead(info.head_kind));
        }
        let model = Self {
            gguf,
            weights,
            info,
            tokenizer,
            prompts,
            auto_prompt,
            device: None,
        };
        model.validate_tensor_catalog()?;
        let mut model = model;
        model.device = unsafe { DeviceWeights::load(model.weights)? };
        Ok(model)
    }

    pub fn info(&self) -> &ModelInfo {
        &self.info
    }

    pub fn tokenizer(&self) -> &Tokenizer {
        &self.tokenizer
    }

    pub fn prompt_id(&self, language: &str) -> Result<usize> {
        if language == "auto" {
            return Ok(self.auto_prompt);
        }
        self.prompts
            .get(language)
            .copied()
            .ok_or_else(|| Error::UnsupportedLanguage(language.to_owned()))
    }

    fn transcribe_chunk(&self, samples: &[f32], language: &str) -> Result<Transcription> {
        let features = crate::MelFrontend::new(crate::MelConfig::default())?.compute(samples)?;
        let (encoded, shape) = self.encode(&features, self.prompt_id(language)?)?;
        let tokens = self.decode(&encoded, shape[1] as usize)?;
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
        let ranges = vad.segments(samples).map_err(|error| Error::Vad(error.to_string()))?;
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
        for range in ranges {
            if should_abort() {
                return Err(Error::Aborted);
            }
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

    pub fn encode(&self, features: &MelFeatures, prompt_id: usize) -> Result<(Vec<f32>, [i64; 3])> {
        if prompt_id >= self.info.prompt_count as usize {
            return Err(Error::InvalidMetadata {
                key: "language",
                message: format!("prompt id {prompt_id} is out of range"),
            });
        }
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
            let mask = chunk_mask(time, 56, 13);
            let mut prompt = vec![0.0f32; self.info.prompt_count as usize * time];
            for t in 0..time {
                prompt[t * self.info.prompt_count as usize + prompt_id] = 1.0;
            }
            runtime.execute(
                &mut graph,
                &[
                    (input, &features.data),
                    (built.position, &positions),
                    (built.mask, &mask),
                    (built.prompt, &prompt),
                ],
            )?;
            let shape = [(*built.output).ne[0], (*built.output).ne[1], (*built.output).ne[2]];
            let count = shape.iter().product::<i64>() as usize;
            let mut data = vec![0.0f32; count];
            sys::ggml_backend_tensor_get(built.output, data.as_mut_ptr().cast(), 0, data.len() * 4);
            Ok((data, shape))
        }
    }

    pub(crate) fn tensor(&self, name: &str) -> Option<*mut sys::ggml_tensor> {
        if let Some(device) = &self.device {
            let name = CString::new(name).ok()?;
            let tensor = unsafe { sys::ggml_get_tensor(device.ctx, name.as_ptr()) };
            return (!tensor.is_null()).then_some(tensor);
        }
        self.cpu_tensor(name)
    }

    pub(crate) fn cpu_tensor(&self, name: &str) -> Option<*mut sys::ggml_tensor> {
        let name = CString::new(name).ok()?;
        let tensor = unsafe { sys::ggml_get_tensor(self.weights, name.as_ptr()) };
        (!tensor.is_null()).then_some(tensor)
    }

    fn require(&self, name: impl AsRef<str>) -> Result<()> {
        let name = name.as_ref();
        self.cpu_tensor(name)
            .map(|_| ())
            .ok_or_else(|| Error::MissingTensor(name.to_owned()))
    }

    fn validate_tensor_catalog(&self) -> Result<()> {
        for name in [
            "enc.pre_encode.conv.0.weight",
            "enc.pre_encode.conv.0.bias",
            "enc.pre_encode.conv.2.weight",
            "enc.pre_encode.conv.2.bias",
            "enc.pre_encode.conv.3.weight",
            "enc.pre_encode.conv.3.bias",
            "enc.pre_encode.conv.5.weight",
            "enc.pre_encode.conv.5.bias",
            "enc.pre_encode.conv.6.weight",
            "enc.pre_encode.conv.6.bias",
            "enc.pre_encode.out.weight",
            "enc.pre_encode.out.bias",
            "pred.embed.weight",
            "joint.enc.weight",
            "joint.enc.bias",
            "joint.pred.weight",
            "joint.pred.bias",
            "joint.out.weight",
            "joint.out.bias",
            "prompt.mlp.0.weight",
            "prompt.mlp.0.bias",
            "prompt.mlp.2.weight",
            "prompt.mlp.2.bias",
        ] {
            self.require(name)?;
        }
        for layer in 0..self.info.encoder_layers {
            for suffix in [
                "norm_ff1.weight",
                "norm_ff1.bias",
                "ff1.linear1.weight",
                "ff1.linear2.weight",
                "norm_attn.weight",
                "norm_attn.bias",
                "attn.linear_q.weight",
                "attn.linear_k.weight",
                "attn.linear_v.weight",
                "attn.linear_out.weight",
                "attn.linear_pos.weight",
                "attn.pos_bias_u",
                "attn.pos_bias_v",
                "norm_conv.weight",
                "norm_conv.bias",
                "conv.pointwise1.weight",
                "conv.depthwise.weight",
                "conv.pointwise2.weight",
                "conv.bn.weight",
                "conv.bn.bias",
                "norm_ff2.weight",
                "norm_ff2.bias",
                "ff2.linear1.weight",
                "ff2.linear2.weight",
                "norm_out.weight",
                "norm_out.bias",
            ] {
                self.require(format!("enc.blocks.{layer}.{suffix}"))?;
            }
            if self.info.encoder_uses_bias {
                for suffix in [
                    "ff1.linear1.bias",
                    "ff1.linear2.bias",
                    "attn.linear_q.bias",
                    "attn.linear_k.bias",
                    "attn.linear_v.bias",
                    "attn.linear_out.bias",
                    "conv.pointwise1.bias",
                    "conv.depthwise.bias",
                    "conv.pointwise2.bias",
                    "ff2.linear1.bias",
                    "ff2.linear2.bias",
                ] {
                    self.require(format!("enc.blocks.{layer}.{suffix}"))?;
                }
            }
        }
        // Nemotron 3.5 currently has two predictor LSTM layers.
        for layer in 0..2 {
            for suffix in ["Wx", "Wh", "bias"] {
                self.require(format!("pred.lstm.{layer}.{suffix}"))?;
            }
        }
        Ok(())
    }
}

impl DeviceWeights {
    unsafe fn load(source: *mut sys::ggml_context) -> Result<Option<Self>> {
        if std::env::var_os("NEMOTRON_CPU").is_some() {
            return Ok(None);
        }
        let backend = sys::ggml_backend_init_by_type(sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU, ptr::null());
        if backend.is_null() {
            return Ok(None);
        }
        let mut count = 0usize;
        let mut tensor = sys::ggml_get_first_tensor(source);
        while !tensor.is_null() {
            count += 1;
            tensor = sys::ggml_get_next_tensor(source, tensor);
        }
        let ctx = sys::ggml_init(sys::ggml_init_params {
            mem_size: sys::ggml_tensor_overhead() * (count + 32),
            mem_buffer: ptr::null_mut(),
            no_alloc: true,
        });
        if ctx.is_null() {
            sys::ggml_backend_free(backend);
            return Err(Error::Ggml("device weight context"));
        }
        tensor = sys::ggml_get_first_tensor(source);
        while !tensor.is_null() {
            let copy = sys::ggml_dup_tensor(ctx, tensor);
            sys::ggml_set_name(copy, sys::ggml_get_name(tensor));
            tensor = sys::ggml_get_next_tensor(source, tensor);
        }
        let buffer = sys::ggml_backend_alloc_ctx_tensors(ctx, backend);
        if buffer.is_null() {
            sys::ggml_free(ctx);
            sys::ggml_backend_free(backend);
            return Err(Error::Ggml("device weight buffer"));
        }
        let mut src = sys::ggml_get_first_tensor(source);
        while !src.is_null() {
            let dst = sys::ggml_get_tensor(ctx, sys::ggml_get_name(src));
            if dst.is_null() {
                sys::ggml_backend_buffer_free(buffer);
                sys::ggml_free(ctx);
                sys::ggml_backend_free(backend);
                return Err(Error::Ggml("device weight lookup"));
            }
            sys::ggml_backend_tensor_set(dst, (*src).data, 0, sys::ggml_nbytes(src));
            src = sys::ggml_get_next_tensor(source, src);
        }
        Ok(Some(Self { ctx, buffer, backend }))
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

unsafe fn read_info(ctx: *const sys::gguf_context) -> Result<ModelInfo> {
    Ok(ModelInfo {
        architecture: string(ctx, "general.architecture")?,
        variant: string(ctx, "stt.variant")?,
        head_kind: string(ctx, "stt.parakeet.head_kind")?,
        languages: strings(ctx, "general.languages")?,
        language_detection: optional_bool(ctx, "stt.capability.lang_detect").unwrap_or(false),
        tensor_count: sys::gguf_get_n_tensors(ctx) as usize,
        encoder_layers: u32_value(ctx, "stt.parakeet.encoder.n_layers")? as i32,
        encoder_dimension: u32_value(ctx, "stt.parakeet.encoder.d_model")? as i32,
        encoder_heads: u32_value(ctx, "stt.parakeet.encoder.n_heads")? as i32,
        encoder_uses_bias: bool_value(ctx, "stt.parakeet.encoder.use_bias")?,
        vocabulary_size: u32_value(ctx, "stt.parakeet.predictor.vocab")? as i32,
        prompt_count: optional_u32(ctx, "stt.parakeet.prompt.num_prompts").unwrap_or(0) as i32,
        predictor_hidden: u32_value(ctx, "stt.parakeet.predictor.hidden")? as i32,
        predictor_layers: u32_value(ctx, "stt.parakeet.predictor.n_layers")? as i32,
        joint_hidden: u32_value(ctx, "stt.parakeet.joint.hidden")? as i32,
    })
}

unsafe fn key(ctx: *const sys::gguf_context, name: &'static str) -> Result<i64> {
    let c_name = CString::new(name).unwrap();
    let id = sys::gguf_find_key(ctx, c_name.as_ptr());
    (id >= 0).then_some(id).ok_or(Error::MissingMetadata(name))
}

unsafe fn string(ctx: *const sys::gguf_context, name: &'static str) -> Result<String> {
    let value = sys::gguf_get_val_str(ctx, key(ctx, name)?);
    if value.is_null() {
        return Err(Error::InvalidMetadata {
            key: name,
            message: "null string".into(),
        });
    }
    Ok(CStr::from_ptr(value).to_string_lossy().into_owned())
}

unsafe fn strings(ctx: *const sys::gguf_context, name: &'static str) -> Result<Vec<String>> {
    let id = key(ctx, name)?;
    let count = sys::gguf_get_arr_n(ctx, id);
    (0..count)
        .map(|index| {
            let value = sys::gguf_get_arr_str(ctx, id, index);
            if value.is_null() {
                Err(Error::InvalidMetadata {
                    key: name,
                    message: format!("null string at {index}"),
                })
            } else {
                Ok(CStr::from_ptr(value).to_string_lossy().into_owned())
            }
        })
        .collect()
}

unsafe fn u32_value(ctx: *const sys::gguf_context, name: &'static str) -> Result<u32> {
    Ok(sys::gguf_get_val_u32(ctx, key(ctx, name)?))
}

unsafe fn optional_u32(ctx: *const sys::gguf_context, name: &'static str) -> Option<u32> {
    let c_name = CString::new(name).unwrap();
    let id = sys::gguf_find_key(ctx, c_name.as_ptr());
    (id >= 0).then(|| sys::gguf_get_val_u32(ctx, id))
}

unsafe fn bool_value(ctx: *const sys::gguf_context, name: &'static str) -> Result<bool> {
    Ok(sys::gguf_get_val_bool(ctx, key(ctx, name)?))
}

unsafe fn optional_bool(ctx: *const sys::gguf_context, name: &'static str) -> Option<bool> {
    let c_name = CString::new(name).unwrap();
    let id = sys::gguf_find_key(ctx, c_name.as_ptr());
    (id >= 0).then(|| sys::gguf_get_val_bool(ctx, id))
}

unsafe fn read_prompts(ctx: *const sys::gguf_context) -> Result<(HashMap<String, usize>, usize)> {
    let locales = strings(ctx, "stt.parakeet.prompt.dictionary.locales")?;
    let indices_key = key(ctx, "stt.parakeet.prompt.dictionary.indices")?;
    let count = sys::gguf_get_arr_n(ctx, indices_key);
    if count != locales.len() {
        return Err(Error::InvalidMetadata {
            key: "stt.parakeet.prompt.dictionary.indices",
            message: "locale/index length mismatch".into(),
        });
    }
    let indices = std::slice::from_raw_parts(sys::gguf_get_arr_data(ctx, indices_key).cast::<i32>(), count);
    let prompts = locales.into_iter().zip(indices.iter().map(|&value| value as usize)).collect();
    let auto_prompt = sys::gguf_get_val_u32(ctx, key(ctx, "stt.parakeet.prompt.auto_id")?) as usize;
    Ok((prompts, auto_prompt))
}
