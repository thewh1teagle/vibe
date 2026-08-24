//! Getting a Parakeet GGUF off disk and into a [`Model`]: reading the metadata
//! keys, checking the tensor catalog is complete, and uploading the weights to
//! a GPU backend when one is available.
//!
//! Inference itself lives in [`crate::model`]; nothing here runs a graph.

use std::ffi::{CStr, CString};
use std::path::Path;
use std::ptr;
use std::time::Instant;

use crate::model::{DeviceWeights, Model, ModelInfo};
use crate::{sys, Error, Result, Tokenizer};

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
        let started = Instant::now();
        eprintln!("[parakeet][load] begin path={}", path.as_ref().display());
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

        let loaded = match unsafe { read_info(gguf).and_then(|info| Tokenizer::load(gguf).map(|tok| (info, tok))) } {
            Ok(loaded) => loaded,
            Err(error) => {
                unsafe {
                    sys::ggml_free(weights);
                    sys::gguf_free(gguf);
                }
                return Err(error);
            }
        };
        let (info, tokenizer) = loaded;
        if info.architecture != "parakeet" {
            unsafe {
                sys::ggml_free(weights);
                sys::gguf_free(gguf);
            }
            return Err(Error::UnsupportedArchitecture(info.architecture));
        }
        if info.head_kind != "tdt" {
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
            device: None,
        };
        if model.info.tdt_durations.is_empty() || model.info.tdt_durations.len() != model.info.joint_extra_outputs as usize {
            return Err(Error::InvalidMetadata {
                key: "stt.parakeet.tdt.durations",
                message: format!(
                    "duration count {} does not match joint extra outputs {}",
                    model.info.tdt_durations.len(),
                    model.info.joint_extra_outputs
                ),
            });
        }
        model.validate_tensor_catalog()?;
        let mut model = model;
        model.device = unsafe { DeviceWeights::load(model.weights)? };
        eprintln!(
            "[parakeet][load] done elapsed_ms={} variant={} tensors={} backend={}",
            started.elapsed().as_millis(),
            model.info.variant,
            model.info.tensor_count,
            if model.device.is_some() { "gpu" } else { "cpu" }
        );
        Ok(model)
    }

    pub(crate) fn require(&self, name: impl AsRef<str>) -> Result<()> {
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
                "conv.bn.running_mean",
                "conv.bn.running_var",
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
        for layer in 0..self.info.predictor_layers {
            for suffix in ["Wx", "Wh", "bias"] {
                if suffix == "bias" && self.cpu_tensor(&format!("pred.lstm.{layer}.bias")).is_none() {
                    self.require(format!("decoder.lstm.{layer}.b_ih"))?;
                    self.require(format!("decoder.lstm.{layer}.b_hh"))?;
                } else {
                    self.require(format!("pred.lstm.{layer}.{suffix}"))?;
                }
            }
        }
        Ok(())
    }
}

impl DeviceWeights {
    pub(crate) unsafe fn load(source: *mut sys::ggml_context) -> Result<Option<Self>> {
        if std::env::var_os("PARAKEET_CPU").is_some() {
            return Ok(None);
        }
        // Dynamic Linux GPU backends are registered by loading their
        // modules; static Metal builds treat this as a harmless no-op.
        sys::ggml_backend_load_all();
        let mut backend = sys::ggml_backend_init_by_type(sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU, ptr::null());
        if backend.is_null() {
            // Unified-memory GPUs such as NVIDIA GB10 are classified as
            // IGPU by GGML even though they provide the Vulkan/CUDA backend.
            backend = sys::ggml_backend_init_by_type(sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_IGPU, ptr::null());
        }
        if backend.is_null() {
            return Ok(None);
        }
        let mut count = 0usize;
        let mut tensor = sys::ggml_get_first_tensor(source);
        while !tensor.is_null() {
            count += 1;
            tensor = sys::ggml_get_next_tensor(source, tensor);
        }
        eprintln!("[parakeet][load] uploading_tensors={} backend=gpu", count);
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
        eprintln!("[parakeet][load] upload_complete tensors={}", count);
        Ok(Some(Self { ctx, buffer, backend }))
    }
}

unsafe fn read_info(ctx: *const sys::gguf_context) -> Result<ModelInfo> {
    if find_key(ctx, "stt.variant").is_none() {
        return Ok(ModelInfo {
            architecture: string(ctx, "general.architecture")?,
            variant: "tdt-0.6b-v3".into(),
            head_kind: "tdt".into(),
            languages: V3_LANGUAGES.iter().map(|value| (*value).to_owned()).collect(),
            language_detection: true,
            tensor_count: sys::gguf_get_n_tensors(ctx) as usize,
            encoder_layers: u32_fallback(ctx, "parakeet.n_layers")? as i32,
            encoder_dimension: u32_fallback(ctx, "parakeet.d_model")? as i32,
            encoder_heads: u32_fallback(ctx, "parakeet.n_heads")? as i32,
            encoder_uses_bias: false,
            encoder_xscaling: true,
            encoder_conv_kernel: u32_fallback(ctx, "parakeet.conv_kernel")? as i32,
            vocabulary_size: u32_fallback(ctx, "parakeet.vocab_size")? as i32 + 1,
            predictor_hidden: u32_fallback(ctx, "parakeet.pred_hidden")? as i32,
            predictor_layers: u32_fallback(ctx, "parakeet.pred_layers")? as i32,
            joint_hidden: u32_fallback(ctx, "parakeet.joint_hidden")? as i32,
            joint_extra_outputs: u32_fallback(ctx, "parakeet.n_tdt_durations")? as i32,
            joint_activation: "relu".into(),
            tdt_durations: i32_array(ctx, "parakeet.tdt_durations")?,
            tdt_max_symbols: 10,
        });
    }
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
        encoder_xscaling: optional_bool(ctx, "stt.parakeet.encoder.xscaling").unwrap_or(false),
        encoder_conv_kernel: u32_value(ctx, "stt.parakeet.encoder.conv_kernel")? as i32,
        vocabulary_size: u32_value(ctx, "stt.parakeet.predictor.vocab")? as i32,
        predictor_hidden: u32_value(ctx, "stt.parakeet.predictor.hidden")? as i32,
        predictor_layers: u32_value(ctx, "stt.parakeet.predictor.n_layers")? as i32,
        joint_hidden: u32_value(ctx, "stt.parakeet.joint.hidden")? as i32,
        joint_extra_outputs: u32_value(ctx, "stt.parakeet.joint.num_extra_outputs")? as i32,
        joint_activation: string(ctx, "stt.parakeet.joint.activation")?,
        tdt_durations: i32_array(ctx, "stt.parakeet.tdt.durations")?,
        tdt_max_symbols: optional_u32(ctx, "stt.parakeet.tdt.max_symbols").unwrap_or(10) as i32,
    })
}

const V3_LANGUAGES: &[&str] = &[
    "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt", "mt", "pl", "pt", "ro", "ru", "sk",
    "sl", "es", "sv", "uk",
];

unsafe fn find_key(ctx: *const sys::gguf_context, name: &str) -> Option<i64> {
    let name = CString::new(name).ok()?;
    let id = sys::gguf_find_key(ctx, name.as_ptr());
    (id >= 0).then_some(id)
}

unsafe fn u32_fallback(ctx: *const sys::gguf_context, name: &'static str) -> Result<u32> {
    find_key(ctx, name)
        .map(|id| sys::gguf_get_val_u32(ctx, id))
        .ok_or(Error::MissingMetadata(name))
}

fn tensor_alias(name: &str) -> Option<String> {
    let direct = match name {
        "enc.pre_encode.conv.0.weight" => "encoder.pre.conv.0.weight",
        "enc.pre_encode.conv.0.bias" => "encoder.pre.conv.0.bias",
        "enc.pre_encode.conv.2.weight" => "encoder.pre.conv.2.weight",
        "enc.pre_encode.conv.2.bias" => "encoder.pre.conv.2.bias",
        "enc.pre_encode.conv.3.weight" => "encoder.pre.conv.3.weight",
        "enc.pre_encode.conv.3.bias" => "encoder.pre.conv.3.bias",
        "enc.pre_encode.conv.5.weight" => "encoder.pre.conv.5.weight",
        "enc.pre_encode.conv.5.bias" => "encoder.pre.conv.5.bias",
        "enc.pre_encode.conv.6.weight" => "encoder.pre.conv.6.weight",
        "enc.pre_encode.conv.6.bias" => "encoder.pre.conv.6.bias",
        "enc.pre_encode.out.weight" => "encoder.pre.out.weight",
        "enc.pre_encode.out.bias" => "encoder.pre.out.bias",
        "pred.embed.weight" => "decoder.embed.weight",
        _ => "",
    };
    if !direct.is_empty() {
        return Some(direct.into());
    }
    if let Some(rest) = name.strip_prefix("pred.lstm.") {
        return Some(format!(
            "decoder.lstm.{}",
            rest.replace(".Wx", ".w_ih").replace(".Wh", ".w_hh")
        ));
    }
    let rest = name.strip_prefix("enc.blocks.")?;
    let (layer, suffix) = rest.split_once('.')?;
    let suffix = suffix
        .replace("attn.linear_q", "attn.q")
        .replace("attn.linear_k", "attn.k")
        .replace("attn.linear_v", "attn.v")
        .replace("attn.linear_out", "attn.out")
        .replace("attn.linear_pos", "attn.pos")
        .replace("conv.pointwise1", "conv.pw1")
        .replace("conv.depthwise", "conv.dw")
        .replace("conv.pointwise2", "conv.pw2");
    Some(format!("encoder.layers.{layer}.{suffix}"))
}

pub(crate) fn lookup_tensor(ctx: *mut sys::ggml_context, name: &str) -> Option<*mut sys::ggml_tensor> {
    for candidate in [Some(name.to_owned()), tensor_alias(name)].into_iter().flatten() {
        let candidate = CString::new(candidate).ok()?;
        let tensor = unsafe { sys::ggml_get_tensor(ctx, candidate.as_ptr()) };
        if !tensor.is_null() {
            return Some(tensor);
        }
    }
    None
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

unsafe fn i32_array(ctx: *const sys::gguf_context, name: &'static str) -> Result<Vec<i32>> {
    let id = key(ctx, name)?;
    let count = sys::gguf_get_arr_n(ctx, id);
    let data = sys::gguf_get_arr_data(ctx, id).cast::<i32>();
    if data.is_null() {
        return Err(Error::InvalidMetadata {
            key: name,
            message: "null array".into(),
        });
    }
    Ok(std::slice::from_raw_parts(data, count).to_vec())
}

unsafe fn bool_value(ctx: *const sys::gguf_context, name: &'static str) -> Result<bool> {
    Ok(sys::gguf_get_val_bool(ctx, key(ctx, name)?))
}

unsafe fn optional_bool(ctx: *const sys::gguf_context, name: &'static str) -> Option<bool> {
    let c_name = CString::new(name).unwrap();
    let id = sys::gguf_find_key(ctx, c_name.as_ptr());
    (id >= 0).then(|| sys::gguf_get_val_bool(ctx, id))
}
