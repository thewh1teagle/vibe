//! A loaded Sortformer GGUF: the contexts that own every tensor, the optional
//! GPU copy of them, the load-time BatchNorm fusion, and the accessors the
//! graph builders read weights through.
//!
//! Decoding the file itself — the hyper-parameter KVs and the tensor catalog —
//! lives in [`crate::sf_gguf`], whose types this module re-exports so callers
//! keep reaching them at `crate::sf_weights`.
//!
//! Structurally this is `crates/parakeet-rs/src/model.rs` plus its
//! `load.rs`-shaped entry point; the GPU-upload dance is the same because it
//! has to be (the graph wants every weight on one backend).

use std::ffi::CString;
use std::path::Path;
use std::ptr;

use crate::sf_gguf::{
    read_hparams, resolve_conformer_block, resolve_head, resolve_pre_encode, resolve_transformer_block, string_kv, tensor,
};
use crate::sf_ops::{sys, Tensor};

pub use crate::sf_gguf::SortformerHParams;
pub(crate) use crate::sf_gguf::{ConformerBlockView, DiarHeadView, PreEncodeView, TransformerBlockView};

#[derive(Debug, thiserror::Error)]
pub enum SfError {
    #[error("model path contains an interior NUL")]
    InvalidPath,
    #[error("failed to load GGUF model: {0}")]
    Load(String),
    #[error("missing GGUF metadata key: {0}")]
    MissingMetadata(String),
    #[error("unsupported model architecture {0:?}; expected sortformer")]
    UnsupportedArchitecture(String),
    #[error("model is missing required tensor {0}")]
    MissingTensor(String),
    #[error("tensor {name} has shape {have:?}, expected {want:?}")]
    TensorShape { name: String, have: [i64; 2], want: [i64; 2] },
    #[error("pre_ln=true transformer is not supported (post-LN only)")]
    UnsupportedTransformer,
    #[error("GGML operation failed: {0}")]
    Ggml(&'static str),
}

pub type SfResult<T> = std::result::Result<T, SfError>;
/// A loaded Sortformer GGUF: metadata, tensor storage and (when a GPU backend
/// is available) the device copy of every weight.
pub struct SortformerWeights {
    gguf: *mut sys::gguf_context,
    /// The mmap-backed CPU context that owns the original tensor data.
    weights: *mut sys::ggml_context,
    device: Option<DeviceWeights>,
    /// Context owning the fused BatchNorm scale/bias tensors.
    bn_ctx: *mut sys::ggml_context,
    bn_buffer: sys::ggml_backend_buffer_t,

    hparams: SortformerHParams,
    pre_encode: PreEncodeView,
    blocks: Vec<ConformerBlockView>,
    tf_blocks: Vec<TransformerBlockView>,
    head: DiarHeadView,
}

struct DeviceWeights {
    ctx: *mut sys::ggml_context,
    buffer: sys::ggml_backend_buffer_t,
    backend: sys::ggml_backend_t,
}

// The GGML contexts are only ever touched behind &mut / during graph building
// on one thread at a time, which is the same contract parakeet-rs::Model uses.
unsafe impl Send for SortformerWeights {}

impl Drop for DeviceWeights {
    fn drop(&mut self) {
        unsafe {
            sys::ggml_backend_buffer_free(self.buffer);
            sys::ggml_free(self.ctx);
            sys::ggml_backend_free(self.backend);
        }
    }
}

impl Drop for SortformerWeights {
    fn drop(&mut self) {
        unsafe {
            if !self.bn_buffer.is_null() {
                sys::ggml_backend_buffer_free(self.bn_buffer);
            }
            if !self.bn_ctx.is_null() {
                sys::ggml_free(self.bn_ctx);
            }
            self.device = None;
            sys::ggml_free(self.weights);
            sys::gguf_free(self.gguf);
        }
    }
}

impl SortformerWeights {
    pub fn hparams(&self) -> &SortformerHParams {
        &self.hparams
    }

    /// The backend every weight lives on, or null when running on the CPU
    /// copy that the GGUF was mapped into.
    pub(crate) fn backend(&self) -> sys::ggml_backend_t {
        match &self.device {
            Some(device) => device.backend,
            None => ptr::null_mut(),
        }
    }

    /// True when the weights were left on the CPU. The pointwise conv weights
    /// then need promoting to F32 in the graph (see `conv_module`).
    pub(crate) fn promote_pointwise(&self) -> bool {
        self.device.is_none()
    }

    pub(crate) fn pre_encode(&self) -> &PreEncodeView {
        &self.pre_encode
    }

    pub(crate) fn blocks(&self) -> &[ConformerBlockView] {
        &self.blocks
    }

    pub(crate) fn tf_blocks(&self) -> &[TransformerBlockView] {
        &self.tf_blocks
    }

    /// The trained mel filterbank shipped with the checkpoint as
    /// `preprocessor.fb`, ggml `ne = [freq_bins, n_mels]`, i.e. in memory
    /// `[n_mels][freq_bins]` row-major.
    ///
    /// Read from the mmap-backed CPU context rather than the device copy, so
    /// this never has to round-trip through the GPU. NeMo builds this bank with
    /// torchaudio; recomputing it from librosa's formulas gets close but not
    /// bit-identical, so the host mel frontend prefers this.
    pub fn mel_filterbank(&self) -> SfResult<Vec<f32>> {
        unsafe {
            let t = tensor(self.weights, "preprocessor.fb")?;
            if (*t).type_ != sys::ggml_type_GGML_TYPE_F32 {
                return Err(SfError::Ggml("preprocessor.fb is not F32"));
            }
            let n = sys::ggml_nelements(t) as usize;
            Ok(std::slice::from_raw_parts((*t).data as *const f32, n).to_vec())
        }
    }

    pub(crate) fn head(&self) -> &DiarHeadView {
        &self.head
    }

    pub fn load(path: impl AsRef<Path>) -> SfResult<Self> {
        let display = path.as_ref().display().to_string();
        let c_path = CString::new(path.as_ref().to_string_lossy().as_bytes()).map_err(|_| SfError::InvalidPath)?;
        let mut weights = ptr::null_mut();
        let gguf = unsafe {
            sys::gguf_init_from_file(
                c_path.as_ptr(),
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
            return Err(SfError::Load(display));
        }

        let built = (|| -> SfResult<Self> {
            let architecture = unsafe { string_kv(gguf, "general.architecture") }?;
            if architecture != "sortformer" {
                return Err(SfError::UnsupportedArchitecture(architecture));
            }
            let hparams = unsafe { read_hparams(gguf) }?;
            if hparams.tf_pre_ln {
                return Err(SfError::UnsupportedTransformer);
            }

            // Upload to a GPU backend when one exists; every subsequent tensor
            // lookup then resolves against the device context.
            let device = unsafe { DeviceWeights::load(weights) }?;
            let lookup_ctx = match &device {
                Some(device) => device.ctx,
                None => weights,
            };

            let pre_encode = unsafe { resolve_pre_encode(lookup_ctx) }?;
            let mut blocks = Vec::with_capacity(hparams.enc_layers as usize);
            for layer in 0..hparams.enc_layers {
                blocks.push(unsafe { resolve_conformer_block(lookup_ctx, layer, &hparams) }?);
            }
            let mut tf_blocks = Vec::with_capacity(hparams.tf_layers as usize);
            for layer in 0..hparams.tf_layers {
                tf_blocks.push(unsafe { resolve_transformer_block(lookup_ctx, layer, &hparams) }?);
            }
            let head = unsafe { resolve_head(lookup_ctx, &hparams) }?;

            Ok(Self {
                gguf,
                weights,
                device,
                bn_ctx: ptr::null_mut(),
                bn_buffer: ptr::null_mut(),
                hparams,
                pre_encode,
                blocks,
                tf_blocks,
                head,
            })
        })();

        let mut model = match built {
            Ok(model) => model,
            Err(error) => {
                unsafe {
                    sys::ggml_free(weights);
                    sys::gguf_free(gguf);
                }
                return Err(error);
            }
        };
        // Must run AFTER the upload: the fusion reads the tensor data through
        // whichever buffer now holds it (`model.cpp:216-218`).
        unsafe { fuse_batch_norm(&mut model) }?;
        Ok(model)
    }
}

/// Fold each conformer block's BatchNorm into a per-channel scale/bias pair.
///
/// ```text
/// scale = gamma / sqrt(running_var + 1e-5)
/// bias  = beta - running_mean * scale
/// ```
///
/// The C++ does this once at load (`fuse_conformer_bn_core`, `model.cpp:216`)
/// rather than every graph build, which matters here because the streaming
/// path rebuilds the whole 17-block graph per chunk. parakeet-rs instead
/// computes the same expression with graph ops each time
/// (`crates/parakeet-rs/src/ops.rs:221-223`) — numerically identical (same
/// 1e-5 epsilon), just paid per chunk.
unsafe fn fuse_batch_norm(model: &mut SortformerWeights) -> SfResult<()> {
    let d_model = model.hparams.enc_d_model;
    let count = model.blocks.len();
    if count == 0 {
        return Ok(());
    }
    let overhead = sys::ggml_tensor_overhead();
    let bytes = d_model as usize * std::mem::size_of::<f32>();

    // On the GPU path the fused tensors are allocated on the backend and
    // filled with ggml_backend_tensor_set. On the CPU path there is no backend
    // buffer at all (the GGUF was mapped straight in), so the context owns the
    // data and we memcpy into it.
    let on_device = model.device.is_some();
    let ctx = sys::ggml_init(sys::ggml_init_params {
        mem_size: overhead * (2 * count + 8) + if on_device { 0 } else { 2 * count * bytes + 1024 },
        mem_buffer: ptr::null_mut(),
        no_alloc: on_device,
    });
    if ctx.is_null() {
        return Err(SfError::Ggml("batch-norm fusion context"));
    }
    model.bn_ctx = ctx;

    for block in model.blocks.iter_mut() {
        block.conv_bn_fused_scale = sys::ggml_new_tensor_1d(ctx, sys::ggml_type_GGML_TYPE_F32, d_model);
        block.conv_bn_fused_bias = sys::ggml_new_tensor_1d(ctx, sys::ggml_type_GGML_TYPE_F32, d_model);
    }
    if on_device {
        let backend = model.backend();
        model.bn_buffer = sys::ggml_backend_alloc_ctx_tensors(ctx, backend);
        if model.bn_buffer.is_null() {
            return Err(SfError::Ggml("batch-norm fusion buffer"));
        }
    }

    let length = d_model as usize;
    for block in model.blocks.iter() {
        let gamma = read_f32(block.conv_bn_w, length);
        let beta = read_f32(block.conv_bn_b, length);
        let mean = read_f32(block.conv_bn_rm, length);
        let var = read_f32(block.conv_bn_rv, length);
        let mut scale = vec![0.0f32; length];
        let mut bias = vec![0.0f32; length];
        for c in 0..length {
            let s = gamma[c] / (var[c] + crate::sf_ops::NORM_EPS).sqrt();
            scale[c] = s;
            bias[c] = beta[c] - mean[c] * s;
        }
        write_f32(block.conv_bn_fused_scale, &scale, on_device);
        write_f32(block.conv_bn_fused_bias, &bias, on_device);
    }
    Ok(())
}

/// Read `length` f32 values out of a tensor, whether it lives in a backend
/// buffer (GPU upload) or in a plain mapped allocation (CPU GGUF).
unsafe fn read_f32(tensor: Tensor, length: usize) -> Vec<f32> {
    let mut values = vec![0.0f32; length];
    let bytes = length * std::mem::size_of::<f32>();
    if (*tensor).buffer.is_null() {
        std::ptr::copy_nonoverlapping((*tensor).data.cast::<f32>(), values.as_mut_ptr(), length);
    } else {
        sys::ggml_backend_tensor_get(tensor, values.as_mut_ptr().cast(), 0, bytes);
    }
    values
}

unsafe fn write_f32(tensor: Tensor, values: &[f32], on_device: bool) {
    let bytes = std::mem::size_of_val(values);
    if on_device {
        sys::ggml_backend_tensor_set(tensor, values.as_ptr().cast(), 0, bytes);
    } else {
        std::ptr::copy_nonoverlapping(values.as_ptr(), (*tensor).data.cast::<f32>(), values.len());
    }
}

impl DeviceWeights {
    /// Mirror of `parakeet-rs::model::DeviceWeights::load` — duplicate a whole
    /// GGML context onto a GPU backend, or return None to stay on the CPU.
    unsafe fn load(source: *mut sys::ggml_context) -> SfResult<Option<Self>> {
        if std::env::var_os("DIARIZE_CPU").is_some() {
            return Ok(None);
        }
        sys::ggml_backend_load_all();
        let mut backend = sys::ggml_backend_init_by_type(sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU, ptr::null());
        if backend.is_null() {
            // Unified-memory parts are reported as IGPU even though they carry
            // a real Vulkan/CUDA backend.
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
        let ctx = sys::ggml_init(sys::ggml_init_params {
            mem_size: sys::ggml_tensor_overhead() * (count + 32),
            mem_buffer: ptr::null_mut(),
            no_alloc: true,
        });
        if ctx.is_null() {
            sys::ggml_backend_free(backend);
            return Err(SfError::Ggml("device weight context"));
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
            return Err(SfError::Ggml("device weight buffer"));
        }
        let mut src = sys::ggml_get_first_tensor(source);
        while !src.is_null() {
            let dst = sys::ggml_get_tensor(ctx, sys::ggml_get_name(src));
            if dst.is_null() {
                sys::ggml_backend_buffer_free(buffer);
                sys::ggml_free(ctx);
                sys::ggml_backend_free(backend);
                return Err(SfError::Ggml("device weight lookup"));
            }
            sys::ggml_backend_tensor_set(dst, (*src).data, 0, sys::ggml_nbytes(src));
            src = sys::ggml_get_next_tensor(source, src);
        }
        Ok(Some(Self { ctx, buffer, backend }))
    }
}
