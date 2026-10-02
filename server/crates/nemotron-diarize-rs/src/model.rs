//! GGUF loading: hyperparameters, weights (uploaded to a GPU backend when there is one), tensor catalog.

use std::ffi::{CStr, CString};
use std::path::Path;
use std::ptr;
use std::time::Instant;

use crate::runtime::{backend_name, load_backends_once, Tensor};
use crate::{sys, Error, Result};

pub const ARCHITECTURE: &str = "nemotron3_diar";

#[derive(Debug, Clone)]
pub struct HParams {
    pub hidden_size: usize,
    pub intermediate_size: usize,
    pub num_layers: usize,
    pub num_heads: usize,
    pub num_mels: usize,
    pub subsampling_factor: usize,
    pub rope_theta: f32,
    pub head_hidden_size: usize,
    pub num_speakers: usize,
    pub chunk_length: usize,
    pub chunk_right_context: usize,
    pub fifo_length: usize,
    pub speaker_cache_update_period: usize,
    pub cache_length: usize,
    pub cache_silence_frames: usize,
    pub prediction_score_threshold: f32,
    pub latest_frames_score_boost: f32,
    pub strong_boost_rate: f32,
    pub weak_boost_rate: f32,
    pub min_positive_scores_rate: f32,
    pub sample_rate: usize,
    pub n_fft: usize,
    pub win_length: usize,
    pub hop_length: usize,
    pub preemphasis: f32,
}

pub(crate) struct LayerWeights {
    pub ln1_w: Tensor,
    pub ln1_b: Tensor,
    pub q: Tensor,
    pub k: Tensor,
    pub v: Tensor,
    pub o_w: Tensor,
    pub o_b: Tensor,
    pub ln2_w: Tensor,
    pub ln2_b: Tensor,
    pub fc1_w: Tensor,
    pub fc1_b: Tensor,
    pub fc2_w: Tensor,
    pub fc2_b: Tensor,
}

/// Resolved tensor pointers, on the device the graphs run on.
pub(crate) struct Weights {
    pub embed: Tensor,
    pub in_ln_w: Tensor,
    pub in_ln_b: Tensor,
    pub layers: Vec<LayerWeights>,
    pub out_ln_w: Tensor,
    pub out_ln_b: Tensor,
    pub proj_w: Tensor,
    pub proj_b: Tensor,
    /// `[in, out, k]` in GGML order: each tap is a contiguous `[in, out]` matrix.
    pub up_w: Tensor,
    pub up_b: Tensor,
    pub dense_w: Tensor,
    pub dense_b: Tensor,
    pub cls_w: Tensor,
    pub cls_b: Tensor,
}

pub(crate) struct Model {
    gguf: *mut sys::gguf_context,
    host: *mut sys::ggml_context,
    device: Option<DeviceWeights>,
    pub hparams: HParams,
    pub weights: Weights,
    /// Learned embedding filling the reserved silence slots of a compressed speaker cache.
    pub silence_embeds: Vec<f32>,
}

unsafe impl Send for Model {}

struct DeviceWeights {
    ctx: *mut sys::ggml_context,
    buffer: sys::ggml_backend_buffer_t,
    backend: sys::ggml_backend_t,
}

impl Model {
    pub fn load(path: &Path) -> Result<Self> {
        let _span = tracing::info_span!("load", path = %path.display()).entered();
        let started = Instant::now();
        let c_path = CString::new(path.to_string_lossy().as_bytes()).map_err(|_| Error::InvalidPath)?;
        let mut host = ptr::null_mut();
        let gguf = unsafe {
            sys::gguf_init_from_file(
                c_path.as_ptr(),
                sys::gguf_init_params {
                    no_alloc: false,
                    ctx: &mut host,
                },
            )
        };
        if gguf.is_null() || host.is_null() {
            unsafe {
                if !gguf.is_null() {
                    sys::gguf_free(gguf);
                }
            }
            return Err(Error::Load(path.display().to_string()));
        }
        let read_ms = started.elapsed().as_secs_f64() * 1e3;

        // From here `Drop` owns both contexts, so every early return frees them.
        let mut model = Self {
            gguf,
            host,
            device: None,
            hparams: placeholder_hparams(),
            weights: Weights::empty(),
            silence_embeds: Vec::new(),
        };
        unsafe {
            let architecture = string(gguf, "general.architecture")?;
            if architecture != ARCHITECTURE {
                return Err(Error::UnsupportedArchitecture(architecture));
            }
            model.hparams = read_hparams(gguf)?;
            model.silence_embeds = model.host_f32("silence_embeds")?;
            if model.silence_embeds.len() != model.hparams.hidden_size {
                return Err(Error::InvalidMetadata {
                    key: "silence_embeds",
                    message: format!(
                        "{} values, expected {}",
                        model.silence_embeds.len(),
                        model.hparams.hidden_size
                    ),
                });
            }
            model.device = DeviceWeights::upload(&model_tensors(gguf, host))?;
            model.weights = model.resolve_weights()?;
        }

        let (tensors, bytes) = unsafe { tensor_stats(&model_tensors(gguf, host)) };
        tracing::info!(
            tensors,
            mb = bytes as f64 / 1e6,
            layers = model.hparams.num_layers,
            hidden = model.hparams.hidden_size,
            speakers = model.hparams.num_speakers,
            device = model
                .device
                .as_ref()
                .map(|d| unsafe { backend_name(d.backend) })
                .unwrap_or_else(|| "cpu".into()),
            read_ms,
            total_ms = started.elapsed().as_secs_f64() * 1e3,
            "model loaded"
        );
        Ok(model)
    }

    pub fn device_backend(&self) -> Option<sys::ggml_backend_t> {
        self.device.as_ref().map(|device| device.backend)
    }

    unsafe fn tensor(&self, name: &str) -> Result<Tensor> {
        let c_name = CString::new(name).map_err(|_| Error::MissingTensor(name.to_owned()))?;
        let ctx = self.device.as_ref().map(|device| device.ctx).unwrap_or(self.host);
        let tensor = sys::ggml_get_tensor(ctx, c_name.as_ptr());
        if tensor.is_null() {
            Err(Error::MissingTensor(name.to_owned()))
        } else {
            Ok(tensor)
        }
    }

    unsafe fn host_f32(&self, name: &str) -> Result<Vec<f32>> {
        let c_name = CString::new(name).map_err(|_| Error::MissingTensor(name.to_owned()))?;
        let tensor = sys::ggml_get_tensor(self.host, c_name.as_ptr());
        if tensor.is_null() {
            return Err(Error::MissingTensor(name.to_owned()));
        }
        if (*tensor).type_ != sys::ggml_type_GGML_TYPE_F32 {
            return Err(Error::InvalidMetadata {
                key: "tensor type",
                message: format!("{name} must be F32"),
            });
        }
        let count = sys::ggml_nelements(tensor) as usize;
        Ok(std::slice::from_raw_parts((*tensor).data.cast::<f32>(), count).to_vec())
    }

    unsafe fn resolve_weights(&self) -> Result<Weights> {
        let t = |name: &str| self.tensor(name);
        let layers = (0..self.hparams.num_layers)
            .map(|i| {
                let p = format!("model.audio_tower.layers.{i}");
                Ok(LayerWeights {
                    ln1_w: t(&format!("{p}.layer_norm1.weight"))?,
                    ln1_b: t(&format!("{p}.layer_norm1.bias"))?,
                    q: t(&format!("{p}.self_attn.q_proj.weight"))?,
                    k: t(&format!("{p}.self_attn.k_proj.weight"))?,
                    v: t(&format!("{p}.self_attn.v_proj.weight"))?,
                    o_w: t(&format!("{p}.self_attn.o_proj.weight"))?,
                    o_b: t(&format!("{p}.self_attn.o_proj.bias"))?,
                    ln2_w: t(&format!("{p}.layer_norm2.weight"))?,
                    ln2_b: t(&format!("{p}.layer_norm2.bias"))?,
                    fc1_w: t(&format!("{p}.mlp.fc1.weight"))?,
                    fc1_b: t(&format!("{p}.mlp.fc1.bias"))?,
                    fc2_w: t(&format!("{p}.mlp.fc2.weight"))?,
                    fc2_b: t(&format!("{p}.mlp.fc2.bias"))?,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let weights = Weights {
            embed: t("model.audio_tower.embedder.projection.weight")?,
            in_ln_w: t("model.audio_tower.input_layer_norm.weight")?,
            in_ln_b: t("model.audio_tower.input_layer_norm.bias")?,
            layers,
            out_ln_w: t("model.audio_tower.layer_norm.weight")?,
            out_ln_b: t("model.audio_tower.layer_norm.bias")?,
            proj_w: t("model.proj.weight")?,
            proj_b: t("model.proj.bias")?,
            up_w: t("model.upsampler.conv.weight")?,
            up_b: t("model.upsampler.conv.bias")?,
            dense_w: t("classifier.dense.weight")?,
            dense_b: t("classifier.dense.bias")?,
            cls_w: t("classifier.out_proj.weight")?,
            cls_b: t("classifier.out_proj.bias")?,
        };
        let h = &self.hparams;
        let up_ne = (*weights.up_w).ne;
        let expected = [
            h.head_hidden_size as i64,
            (h.head_hidden_size * h.subsampling_factor) as i64,
            3,
        ];
        if up_ne[..3] != expected {
            return Err(Error::InvalidMetadata {
                key: "model.upsampler.conv.weight",
                message: format!(
                    "shape {:?}, expected {expected:?} (re-export with scripts/export.py)",
                    &up_ne[..3]
                ),
            });
        }
        let embed_ne = (*weights.embed).ne;
        if embed_ne[0] as usize != h.num_mels * h.subsampling_factor || embed_ne[1] as usize != h.hidden_size {
            return Err(Error::InvalidMetadata {
                key: "model.audio_tower.embedder.projection.weight",
                message: format!("shape {:?}", &embed_ne[..2]),
            });
        }
        Ok(weights)
    }
}

impl Drop for Model {
    fn drop(&mut self) {
        // Device weights first: they hold a backend and a buffer, the host context only memory.
        self.device = None;
        unsafe {
            sys::ggml_free(self.host);
            sys::gguf_free(self.gguf);
        }
    }
}

impl DeviceWeights {
    /// Copies every host tensor to a GPU backend. `None` runs on the CPU against the mapped host data.
    unsafe fn upload(source: &[Tensor]) -> Result<Option<Self>> {
        if std::env::var_os("NEMOTRON_DIARIZE_CPU").is_some() {
            tracing::info!("NEMOTRON_DIARIZE_CPU set, keeping weights on the CPU");
            return Ok(None);
        }
        load_backends_once();
        let backend = sys::ggml_backend_init_by_type(sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU, ptr::null());
        if backend.is_null() {
            tracing::info!("no GPU backend, running on the CPU");
            return Ok(None);
        }
        let started = Instant::now();
        let ctx = sys::ggml_init(sys::ggml_init_params {
            mem_size: sys::ggml_tensor_overhead() * (source.len() + 8),
            mem_buffer: ptr::null_mut(),
            no_alloc: true,
        });
        if ctx.is_null() {
            sys::ggml_backend_free(backend);
            return Err(Error::Ggml("device weight context"));
        }
        for &tensor in source {
            let copy = sys::ggml_dup_tensor(ctx, tensor);
            sys::ggml_set_name(copy, sys::ggml_get_name(tensor));
        }
        let buffer = sys::ggml_backend_alloc_ctx_tensors(ctx, backend);
        if buffer.is_null() {
            sys::ggml_free(ctx);
            sys::ggml_backend_free(backend);
            return Err(Error::Ggml("device weight buffer"));
        }
        for &src in source {
            let dst = sys::ggml_get_tensor(ctx, sys::ggml_get_name(src));
            sys::ggml_backend_tensor_set(dst, (*src).data, 0, sys::ggml_nbytes(src));
        }
        tracing::info!(
            backend = backend_name(backend),
            mb = sys::ggml_backend_buffer_get_size(buffer) as f64 / 1e6,
            ms = started.elapsed().as_secs_f64() * 1e3,
            "weights uploaded"
        );
        Ok(Some(Self { ctx, buffer, backend }))
    }
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

impl Weights {
    fn empty() -> Self {
        let null = ptr::null_mut();
        Self {
            embed: null,
            in_ln_w: null,
            in_ln_b: null,
            layers: Vec::new(),
            out_ln_w: null,
            out_ln_b: null,
            proj_w: null,
            proj_b: null,
            up_w: null,
            up_b: null,
            dense_w: null,
            dense_b: null,
            cls_w: null,
            cls_b: null,
        }
    }
}

/// The GGUF's tensors. Iterating the host context instead would also yield the
/// data blob `gguf_init_from_file` adds when it loads data, duplicating every weight.
unsafe fn model_tensors(gguf: *const sys::gguf_context, host: *mut sys::ggml_context) -> Vec<Tensor> {
    (0..sys::gguf_get_n_tensors(gguf))
        .map(|id| sys::ggml_get_tensor(host, sys::gguf_get_tensor_name(gguf, id)))
        .filter(|tensor| !tensor.is_null())
        .collect()
}

unsafe fn tensor_stats(tensors: &[Tensor]) -> (usize, usize) {
    (tensors.len(), tensors.iter().map(|&tensor| sys::ggml_nbytes(tensor)).sum())
}

fn placeholder_hparams() -> HParams {
    HParams {
        hidden_size: 0,
        intermediate_size: 0,
        num_layers: 0,
        num_heads: 0,
        num_mels: 0,
        subsampling_factor: 0,
        rope_theta: 0.0,
        head_hidden_size: 0,
        num_speakers: 0,
        chunk_length: 0,
        chunk_right_context: 0,
        fifo_length: 0,
        speaker_cache_update_period: 0,
        cache_length: 0,
        cache_silence_frames: 0,
        prediction_score_threshold: 0.0,
        latest_frames_score_boost: 0.0,
        strong_boost_rate: 0.0,
        weak_boost_rate: 0.0,
        min_positive_scores_rate: 0.0,
        sample_rate: 0,
        n_fft: 0,
        win_length: 0,
        hop_length: 0,
        preemphasis: 0.0,
    }
}

unsafe fn read_hparams(ctx: *const sys::gguf_context) -> Result<HParams> {
    let u = |key: &'static str| u32_value(ctx, key).map(|v| v as usize);
    let f = |key: &'static str| f32_value(ctx, key);
    let hparams = HParams {
        hidden_size: u("nemotron3_diar.audio.hidden_size")?,
        intermediate_size: u("nemotron3_diar.audio.intermediate_size")?,
        num_layers: u("nemotron3_diar.audio.num_layers")?,
        num_heads: u("nemotron3_diar.audio.num_heads")?,
        num_mels: u("nemotron3_diar.audio.num_mels")?,
        subsampling_factor: u("nemotron3_diar.audio.subsampling_factor")?,
        rope_theta: f("nemotron3_diar.audio.rope_theta")?,
        head_hidden_size: u("nemotron3_diar.head.hidden_size")?,
        num_speakers: u("nemotron3_diar.head.num_speakers")?,
        chunk_length: u("nemotron3_diar.offline.chunk_length")?,
        chunk_right_context: u("nemotron3_diar.offline.chunk_right_context")?,
        fifo_length: u("nemotron3_diar.offline.fifo_length")?,
        speaker_cache_update_period: u("nemotron3_diar.offline.speaker_cache_update_period")?,
        cache_length: u("nemotron3_diar.cache.length")?,
        cache_silence_frames: u("nemotron3_diar.cache.silence_frames_per_speaker")?,
        prediction_score_threshold: f("nemotron3_diar.cache.prediction_score_threshold")?,
        latest_frames_score_boost: f("nemotron3_diar.cache.latest_frames_score_boost")?,
        strong_boost_rate: f("nemotron3_diar.cache.strong_boost_rate")?,
        weak_boost_rate: f("nemotron3_diar.cache.weak_boost_rate")?,
        min_positive_scores_rate: f("nemotron3_diar.cache.min_positive_scores_rate")?,
        sample_rate: u("nemotron3_diar.mel.sample_rate")?,
        n_fft: u("nemotron3_diar.mel.n_fft")?,
        win_length: u("nemotron3_diar.mel.win_length")?,
        hop_length: u("nemotron3_diar.mel.hop_length")?,
        preemphasis: f("nemotron3_diar.mel.preemphasis")?,
    };
    let invalid = |key: &'static str, message: &str| Error::InvalidMetadata {
        key,
        message: message.into(),
    };
    if hparams.num_heads == 0 || !hparams.hidden_size.is_multiple_of(hparams.num_heads) {
        return Err(invalid("nemotron3_diar.audio.num_heads", "must divide hidden_size"));
    }
    if hparams.chunk_right_context >= hparams.chunk_length {
        return Err(invalid(
            "nemotron3_diar.offline.chunk_right_context",
            "must be below chunk_length",
        ));
    }
    if hparams.cache_length < (1 + hparams.cache_silence_frames) * hparams.num_speakers {
        return Err(invalid("nemotron3_diar.cache.length", "too small for the speaker count"));
    }
    tracing::debug!(?hparams, "hparams");
    Ok(hparams)
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

unsafe fn u32_value(ctx: *const sys::gguf_context, name: &'static str) -> Result<u32> {
    Ok(sys::gguf_get_val_u32(ctx, key(ctx, name)?))
}

unsafe fn f32_value(ctx: *const sys::gguf_context, name: &'static str) -> Result<f32> {
    Ok(sys::gguf_get_val_f32(ctx, key(ctx, name)?))
}
