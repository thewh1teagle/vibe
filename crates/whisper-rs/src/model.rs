//! Loader for the whisper.cpp ggml model container, ported from
//! `whisper_model_load`: magic, hparams, mel filterbank, vocabulary, then a
//! stream of named tensors. Tensors are created up-front from the hparams
//! (with the file's ftype deciding the weight type) and the stream is read
//! straight into them, exactly like the C++.

use std::collections::HashMap;
use std::io::{BufReader, Read};
use std::path::Path;

use ggml_rs_sys as sys;

use crate::vocab::Vocab;
use crate::Error;

pub(crate) type Tensor = *mut sys::ggml_tensor;

/// The bytes "lmgg" little-endian — `GGML_FILE_MAGIC`.
const FILE_MAGIC: u32 = 0x6767_6d6c;
const QNT_VERSION_FACTOR: i32 = 1000;

#[derive(Debug, Clone, Copy)]
pub struct Hparams {
    pub n_vocab: i32,
    pub n_audio_ctx: i32,
    pub n_audio_state: i32,
    pub n_audio_head: i32,
    pub n_audio_layer: i32,
    pub n_text_ctx: i32,
    pub n_text_state: i32,
    pub n_text_head: i32,
    pub n_text_layer: i32,
    pub n_mels: i32,
    pub ftype: i32,
    pub eps: f32,
}

pub(crate) struct Filters {
    pub n_mel: i32,
    pub n_fft: i32,
    /// `[n_mel][n_fft]` row-major.
    pub data: Vec<f32>,
}

pub(crate) struct EncoderLayer {
    pub attn_ln_0_w: Tensor,
    pub attn_ln_0_b: Tensor,
    pub attn_ln_1_w: Tensor,
    pub attn_ln_1_b: Tensor,
    pub attn_q_w: Tensor,
    pub attn_q_b: Tensor,
    pub attn_k_w: Tensor,
    pub attn_v_w: Tensor,
    pub attn_v_b: Tensor,
    pub mlp_ln_w: Tensor,
    pub mlp_ln_b: Tensor,
    pub mlp_0_w: Tensor,
    pub mlp_0_b: Tensor,
    pub mlp_1_w: Tensor,
    pub mlp_1_b: Tensor,
}

pub(crate) struct DecoderLayer {
    pub attn_ln_0_w: Tensor,
    pub attn_ln_0_b: Tensor,
    pub attn_ln_1_w: Tensor,
    pub attn_ln_1_b: Tensor,
    pub attn_q_w: Tensor,
    pub attn_q_b: Tensor,
    pub attn_k_w: Tensor,
    pub attn_v_w: Tensor,
    pub attn_v_b: Tensor,
    pub cross_attn_ln_0_w: Tensor,
    pub cross_attn_ln_0_b: Tensor,
    pub cross_attn_ln_1_w: Tensor,
    pub cross_attn_ln_1_b: Tensor,
    pub cross_attn_q_w: Tensor,
    pub cross_attn_q_b: Tensor,
    pub cross_attn_k_w: Tensor,
    pub cross_attn_v_w: Tensor,
    pub cross_attn_v_b: Tensor,
    pub mlp_ln_w: Tensor,
    pub mlp_ln_b: Tensor,
    pub mlp_0_w: Tensor,
    pub mlp_0_b: Tensor,
    pub mlp_1_w: Tensor,
    pub mlp_1_b: Tensor,
}

pub(crate) struct Model {
    ctxs: Vec<*mut sys::ggml_context>,
    buffers: Vec<sys::ggml_backend_buffer_t>,
    pub hparams: Hparams,
    pub filters: Filters,
    pub vocab: Vocab,

    pub e_pe: Tensor,
    pub e_conv_1_w: Tensor,
    pub e_conv_1_b: Tensor,
    pub e_conv_2_w: Tensor,
    pub e_conv_2_b: Tensor,
    pub e_ln_w: Tensor,
    pub e_ln_b: Tensor,

    pub d_pe: Tensor,
    pub d_te: Tensor,
    pub d_ln_w: Tensor,
    pub d_ln_b: Tensor,

    pub layers_encoder: Vec<EncoderLayer>,
    pub layers_decoder: Vec<DecoderLayer>,
}

unsafe impl Send for Model {}

impl Drop for Model {
    fn drop(&mut self) {
        unsafe {
            for &buffer in &self.buffers {
                if !buffer.is_null() {
                    sys::ggml_backend_buffer_free(buffer);
                }
            }
            for &ctx in &self.ctxs {
                if !ctx.is_null() {
                    sys::ggml_free(ctx);
                }
            }
        }
    }
}

struct Reader<R> {
    inner: R,
}

impl<R: Read> Reader<R> {
    fn read_i32(&mut self) -> Result<i32, Error> {
        let mut buf = [0u8; 4];
        self.inner.read_exact(&mut buf).map_err(|_| Error::ModelFormat)?;
        Ok(i32::from_le_bytes(buf))
    }

    fn read_u32(&mut self) -> Result<u32, Error> {
        Ok(self.read_i32()? as u32)
    }

    fn read_bytes(&mut self, len: usize) -> Result<Vec<u8>, Error> {
        let mut buf = vec![0u8; len];
        self.inner.read_exact(&mut buf).map_err(|_| Error::ModelFormat)?;
        Ok(buf)
    }

    fn read_f32_vec(&mut self, count: usize) -> Result<Vec<f32>, Error> {
        let bytes = self.read_bytes(count * 4)?;
        Ok(bytes
            .chunks_exact(4)
            .map(|c| f32::from_le_bytes(c.try_into().unwrap()))
            .collect())
    }
}

/// A tensor to create: (name, type, defining op, shape).
struct Spec {
    name: String,
    kind: sys::ggml_type,
    op: sys::ggml_op,
    ne: Vec<i64>,
}

/// Port of `make_buft_list` for the CPU-only path: every "extra" CPU buffer
/// type (e.g. the aarch64 repack layouts), then the default CPU buffer type.
unsafe fn cpu_buft_list() -> Vec<(sys::ggml_backend_dev_t, sys::ggml_backend_buffer_type_t)> {
    let mut list = Vec::new();
    let cpu_dev = sys::ggml_backend_dev_by_type(sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_CPU);
    let cpu_reg = sys::ggml_backend_dev_backend_reg(cpu_dev);
    let addr = sys::ggml_backend_reg_get_proc_address(cpu_reg, c"ggml_backend_dev_get_extra_bufts".as_ptr());
    if !addr.is_null() {
        let get_extra: sys::ggml_backend_dev_get_extra_bufts_t = std::mem::transmute(addr);
        if let Some(get_extra) = get_extra {
            let mut extra = get_extra(cpu_dev);
            while !extra.is_null() && !(*extra).is_null() {
                list.push((cpu_dev, *extra));
                extra = extra.add(1);
            }
        }
    }
    list.push((cpu_dev, sys::ggml_backend_cpu_buffer_type()));
    list
}

/// Port of `weight_buft_supported` + `select_weight_buft`: the first buffer
/// type in the list whose device supports this weight's defining op.
unsafe fn select_weight_buft(
    hparams: &Hparams,
    spec: &Spec,
    buft_list: &[(sys::ggml_backend_dev_t, sys::ggml_backend_buffer_type_t)],
) -> Option<sys::ggml_backend_buffer_type_t> {
    for &(dev, buft) in buft_list {
        if buft == sys::ggml_backend_cpu_buffer_type() {
            // The default CPU backend supports every operator.
            return Some(buft);
        }
        if spec.op != sys::ggml_op_GGML_OP_MUL_MAT && spec.op != sys::ggml_op_GGML_OP_GET_ROWS {
            continue;
        }
        let ctx = sys::ggml_init(sys::ggml_init_params {
            mem_size: 8 * sys::ggml_tensor_overhead(),
            mem_buffer: std::ptr::null_mut(),
            no_alloc: true,
        });
        if ctx.is_null() {
            continue;
        }
        let mut ne = [1i64; 4];
        ne[..spec.ne.len()].copy_from_slice(&spec.ne);
        let w = sys::ggml_new_tensor(ctx, spec.kind, 4, ne.as_ptr());
        let op_tensor = if spec.op == sys::ggml_op_GGML_OP_MUL_MAT {
            let b = sys::ggml_new_tensor_4d(
                ctx,
                sys::ggml_type_GGML_TYPE_F32,
                (*w).ne[0],
                i64::from(hparams.n_audio_ctx),
                (*w).ne[2],
                (*w).ne[3],
            );
            sys::ggml_mul_mat(ctx, w, b)
        } else {
            let indices = sys::ggml_new_tensor_1d(ctx, sys::ggml_type_GGML_TYPE_I32, 8);
            sys::ggml_get_rows(ctx, w, indices)
        };
        // Dummy buffer so supports_op can inspect the buffer type.
        (*w).buffer = sys::ggml_backend_buft_alloc_buffer(buft, 0);
        let supported = sys::ggml_backend_dev_supports_op(dev, op_tensor);
        sys::ggml_backend_buffer_free((*w).buffer);
        (*w).buffer = std::ptr::null_mut();
        sys::ggml_free(ctx);
        if supported {
            return Some(buft);
        }
    }
    None
}

impl Model {
    pub(crate) fn load(path: &Path) -> Result<Self, Error> {
        let span = tracing::info_span!("model_load", path = %path.display());
        let _guard = span.enter();
        let start = std::time::Instant::now();

        let file = std::fs::File::open(path).map_err(|_| Error::OpenModel(path.to_path_buf()))?;
        let mut reader = Reader {
            inner: BufReader::with_capacity(1 << 20, file),
        };

        if reader.read_u32()? != FILE_MAGIC {
            return Err(Error::ModelFormat);
        }

        let mut hparams = Hparams {
            n_vocab: reader.read_i32()?,
            n_audio_ctx: reader.read_i32()?,
            n_audio_state: reader.read_i32()?,
            n_audio_head: reader.read_i32()?,
            n_audio_layer: reader.read_i32()?,
            n_text_ctx: reader.read_i32()?,
            n_text_state: reader.read_i32()?,
            n_text_head: reader.read_i32()?,
            n_text_layer: reader.read_i32()?,
            n_mels: reader.read_i32()?,
            ftype: reader.read_i32()?,
            eps: 1e-5,
        };
        hparams.ftype %= QNT_VERSION_FACTOR;
        let wtype = unsafe { sys::ggml_ftype_to_ggml_type(hparams.ftype) };
        if wtype == sys::ggml_type_GGML_TYPE_COUNT {
            return Err(Error::ModelFormat);
        }
        let vtype = if wtype == sys::ggml_type_GGML_TYPE_F32 {
            sys::ggml_type_GGML_TYPE_F32
        } else {
            sys::ggml_type_GGML_TYPE_F16
        };
        tracing::info!(
            n_vocab = hparams.n_vocab,
            n_audio_state = hparams.n_audio_state,
            n_audio_layer = hparams.n_audio_layer,
            n_text_layer = hparams.n_text_layer,
            n_mels = hparams.n_mels,
            ftype = hparams.ftype,
            "loaded hparams"
        );

        // Mel filterbank.
        let filters = {
            let n_mel = reader.read_i32()?;
            let n_fft = reader.read_i32()?;
            let data = reader.read_f32_vec((n_mel * n_fft) as usize)?;
            Filters { n_mel, n_fft, data }
        };

        // Vocabulary.
        let vocab = {
            let n_stored = reader.read_i32()?;
            let mut words = Vec::with_capacity(n_stored.max(0) as usize);
            for _ in 0..n_stored {
                let len = reader.read_u32()? as usize;
                words.push(reader.read_bytes(len)?);
            }
            Vocab::new(words, hparams.n_vocab)
        };

        // Build the tensor specs from the hparams, mirroring the C++ order.
        let specs = tensor_specs(&hparams, wtype, vtype);

        // Group the tensors by the buffer type `select_weight_buft` picks
        // (repacked "extra" CPU layouts for supported mul_mat/get_rows
        // weights, plain CPU otherwise), one meta context per buffer type —
        // whisper.cpp's ctx_map.
        let buft_list = unsafe { cpu_buft_list() };
        let mut ctx_map: Vec<(sys::ggml_backend_buffer_type_t, *mut sys::ggml_context)> = Vec::new();
        let mut tensors: HashMap<String, Tensor> = HashMap::with_capacity(specs.len());
        unsafe {
            for spec in &specs {
                let Some(buft) = select_weight_buft(&hparams, spec, &buft_list) else {
                    return Err(Error::Ggml("no compatible buffer type for weight"));
                };
                let ctx = match ctx_map.iter().find(|(b, _)| *b == buft) {
                    Some(&(_, ctx)) => ctx,
                    None => {
                        let ctx = sys::ggml_init(sys::ggml_init_params {
                            mem_size: specs.len() * sys::ggml_tensor_overhead() + 4096,
                            mem_buffer: std::ptr::null_mut(),
                            no_alloc: true,
                        });
                        if ctx.is_null() {
                            return Err(Error::Ggml("model context"));
                        }
                        ctx_map.push((buft, ctx));
                        ctx
                    }
                };
                let mut ne = [1i64; 4];
                ne[..spec.ne.len()].copy_from_slice(&spec.ne);
                let tensor = sys::ggml_new_tensor(ctx, spec.kind, 4, ne.as_ptr());
                if tensor.is_null() {
                    return Err(Error::Ggml("model tensor"));
                }
                tensors.insert(spec.name.clone(), tensor);
            }
        }
        let mut ctxs = Vec::new();
        let mut buffers = Vec::new();
        unsafe {
            for &(buft, ctx) in &ctx_map {
                let buffer = sys::ggml_backend_alloc_ctx_tensors_from_buft(ctx, buft);
                if buffer.is_null() {
                    return Err(Error::Ggml("model weight buffer"));
                }
                ctxs.push(ctx);
                buffers.push(buffer);
            }
        }

        // Stream the weights into the pre-created tensors.
        let mut n_loaded = 0usize;
        let mut total_size = 0usize;
        #[allow(clippy::while_let_loop)] // mirrors the C++ read loop
        loop {
            let n_dims = match reader.read_i32() {
                Ok(v) => v,
                Err(_) => break, // eof
            };
            let name_len = reader.read_i32()? as usize;
            let ttype = reader.read_i32()?;

            let mut ne = [1i64; 4];
            let mut nelements = 1i64;
            for dim in ne.iter_mut().take(n_dims.clamp(0, 4) as usize) {
                *dim = i64::from(reader.read_i32()?);
                nelements *= *dim;
            }
            let name = String::from_utf8(reader.read_bytes(name_len)?).map_err(|_| Error::ModelFormat)?;

            let Some(&tensor) = tensors.get(&name) else {
                tracing::error!(name, "unknown tensor in model file");
                return Err(Error::ModelFormat);
            };
            unsafe {
                if sys::ggml_nelements(tensor) != nelements
                    || (*tensor).ne[0] != ne[0]
                    || (*tensor).ne[1] != ne[1]
                    || (*tensor).ne[2] != ne[2]
                {
                    tracing::error!(name, "tensor has wrong shape in model file");
                    return Err(Error::ModelFormat);
                }
                let bpe = sys::ggml_type_size(ttype as sys::ggml_type);
                let blck = sys::ggml_blck_size(ttype as sys::ggml_type) as usize;
                let nbytes = nelements as usize * bpe / blck;
                if nbytes != sys::ggml_nbytes(tensor) {
                    tracing::error!(name, "tensor has wrong size in model file");
                    return Err(Error::ModelFormat);
                }
                if sys::ggml_backend_buffer_is_host((*tensor).buffer) {
                    let dst = std::slice::from_raw_parts_mut((*tensor).data.cast::<u8>(), nbytes);
                    reader.inner.read_exact(dst).map_err(|_| Error::ModelFormat)?;
                } else {
                    // Repacked layouts transform on upload; go through set_tensor.
                    let mut tmp = vec![0u8; nbytes];
                    reader.inner.read_exact(&mut tmp).map_err(|_| Error::ModelFormat)?;
                    sys::ggml_backend_tensor_set(tensor, tmp.as_ptr().cast(), 0, nbytes);
                }
                total_size += nbytes;
            }
            n_loaded += 1;
        }
        if n_loaded != tensors.len() {
            tracing::error!(expected = tensors.len(), got = n_loaded, "not all tensors loaded");
            return Err(Error::ModelFormat);
        }
        unsafe {
            for &buffer in &buffers {
                sys::ggml_backend_buffer_set_usage(buffer, sys::ggml_backend_buffer_usage_GGML_BACKEND_BUFFER_USAGE_WEIGHTS);
            }
        }
        tracing::info!(
            tensors = n_loaded,
            size_mb = total_size as f64 / 1e6,
            elapsed_ms = start.elapsed().as_millis() as u64,
            "model loaded"
        );

        let get = |name: &str| -> Tensor { tensors[name] };
        let layers_encoder = (0..hparams.n_audio_layer)
            .map(|i| EncoderLayer {
                attn_ln_0_w: get(&format!("encoder.blocks.{i}.attn_ln.weight")),
                attn_ln_0_b: get(&format!("encoder.blocks.{i}.attn_ln.bias")),
                attn_ln_1_w: get(&format!("encoder.blocks.{i}.attn.out.weight")),
                attn_ln_1_b: get(&format!("encoder.blocks.{i}.attn.out.bias")),
                attn_q_w: get(&format!("encoder.blocks.{i}.attn.query.weight")),
                attn_q_b: get(&format!("encoder.blocks.{i}.attn.query.bias")),
                attn_k_w: get(&format!("encoder.blocks.{i}.attn.key.weight")),
                attn_v_w: get(&format!("encoder.blocks.{i}.attn.value.weight")),
                attn_v_b: get(&format!("encoder.blocks.{i}.attn.value.bias")),
                mlp_ln_w: get(&format!("encoder.blocks.{i}.mlp_ln.weight")),
                mlp_ln_b: get(&format!("encoder.blocks.{i}.mlp_ln.bias")),
                mlp_0_w: get(&format!("encoder.blocks.{i}.mlp.0.weight")),
                mlp_0_b: get(&format!("encoder.blocks.{i}.mlp.0.bias")),
                mlp_1_w: get(&format!("encoder.blocks.{i}.mlp.2.weight")),
                mlp_1_b: get(&format!("encoder.blocks.{i}.mlp.2.bias")),
            })
            .collect();
        let layers_decoder = (0..hparams.n_text_layer)
            .map(|i| DecoderLayer {
                attn_ln_0_w: get(&format!("decoder.blocks.{i}.attn_ln.weight")),
                attn_ln_0_b: get(&format!("decoder.blocks.{i}.attn_ln.bias")),
                attn_ln_1_w: get(&format!("decoder.blocks.{i}.attn.out.weight")),
                attn_ln_1_b: get(&format!("decoder.blocks.{i}.attn.out.bias")),
                attn_q_w: get(&format!("decoder.blocks.{i}.attn.query.weight")),
                attn_q_b: get(&format!("decoder.blocks.{i}.attn.query.bias")),
                attn_k_w: get(&format!("decoder.blocks.{i}.attn.key.weight")),
                attn_v_w: get(&format!("decoder.blocks.{i}.attn.value.weight")),
                attn_v_b: get(&format!("decoder.blocks.{i}.attn.value.bias")),
                cross_attn_ln_0_w: get(&format!("decoder.blocks.{i}.cross_attn_ln.weight")),
                cross_attn_ln_0_b: get(&format!("decoder.blocks.{i}.cross_attn_ln.bias")),
                cross_attn_ln_1_w: get(&format!("decoder.blocks.{i}.cross_attn.out.weight")),
                cross_attn_ln_1_b: get(&format!("decoder.blocks.{i}.cross_attn.out.bias")),
                cross_attn_q_w: get(&format!("decoder.blocks.{i}.cross_attn.query.weight")),
                cross_attn_q_b: get(&format!("decoder.blocks.{i}.cross_attn.query.bias")),
                cross_attn_k_w: get(&format!("decoder.blocks.{i}.cross_attn.key.weight")),
                cross_attn_v_w: get(&format!("decoder.blocks.{i}.cross_attn.value.weight")),
                cross_attn_v_b: get(&format!("decoder.blocks.{i}.cross_attn.value.bias")),
                mlp_ln_w: get(&format!("decoder.blocks.{i}.mlp_ln.weight")),
                mlp_ln_b: get(&format!("decoder.blocks.{i}.mlp_ln.bias")),
                mlp_0_w: get(&format!("decoder.blocks.{i}.mlp.0.weight")),
                mlp_0_b: get(&format!("decoder.blocks.{i}.mlp.0.bias")),
                mlp_1_w: get(&format!("decoder.blocks.{i}.mlp.2.weight")),
                mlp_1_b: get(&format!("decoder.blocks.{i}.mlp.2.bias")),
            })
            .collect();

        Ok(Self {
            hparams,
            filters,
            vocab,
            e_pe: get("encoder.positional_embedding"),
            e_conv_1_w: get("encoder.conv1.weight"),
            e_conv_1_b: get("encoder.conv1.bias"),
            e_conv_2_w: get("encoder.conv2.weight"),
            e_conv_2_b: get("encoder.conv2.bias"),
            e_ln_w: get("encoder.ln_post.weight"),
            e_ln_b: get("encoder.ln_post.bias"),
            d_pe: get("decoder.positional_embedding"),
            d_te: get("decoder.token_embedding.weight"),
            d_ln_w: get("decoder.ln.weight"),
            d_ln_b: get("decoder.ln.bias"),
            layers_encoder,
            layers_decoder,
            ctxs,
            buffers,
        })
    }
}

fn tensor_specs(hparams: &Hparams, wtype: sys::ggml_type, vtype: sys::ggml_type) -> Vec<Spec> {
    const F32: sys::ggml_type = sys::ggml_type_GGML_TYPE_F32;
    let ns = i64::from(hparams.n_audio_state);
    let ts = i64::from(hparams.n_text_state);
    let mut specs = Vec::new();
    let mut push = |name: String, kind: sys::ggml_type, op: sys::ggml_op, ne: &[i64]| {
        specs.push(Spec {
            name,
            kind,
            op,
            ne: ne.to_vec(),
        });
    };

    push("encoder.positional_embedding".into(), F32, sys::ggml_op_GGML_OP_ADD, &[ns, i64::from(hparams.n_audio_ctx)]);
    push("encoder.conv1.weight".into(), vtype, sys::ggml_op_GGML_OP_IM2COL, &[3, i64::from(hparams.n_mels), ns]);
    push("encoder.conv1.bias".into(), F32, sys::ggml_op_GGML_OP_ADD, &[1, ns]);
    push("encoder.conv2.weight".into(), vtype, sys::ggml_op_GGML_OP_IM2COL, &[3, ns, ns]);
    push("encoder.conv2.bias".into(), F32, sys::ggml_op_GGML_OP_ADD, &[1, ns]);
    push("encoder.ln_post.weight".into(), F32, sys::ggml_op_GGML_OP_MUL, &[ns]);
    push("encoder.ln_post.bias".into(), F32, sys::ggml_op_GGML_OP_ADD, &[ns]);
    for i in 0..hparams.n_audio_layer {
        push(format!("encoder.blocks.{i}.mlp_ln.weight"), F32, sys::ggml_op_GGML_OP_MUL, &[ns]);
        push(format!("encoder.blocks.{i}.mlp_ln.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ns]);
        push(format!("encoder.blocks.{i}.mlp.0.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ns, 4 * ns]);
        push(format!("encoder.blocks.{i}.mlp.0.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[4 * ns]);
        push(format!("encoder.blocks.{i}.mlp.2.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[4 * ns, ns]);
        push(format!("encoder.blocks.{i}.mlp.2.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ns]);
        push(format!("encoder.blocks.{i}.attn_ln.weight"), F32, sys::ggml_op_GGML_OP_MUL, &[ns]);
        push(format!("encoder.blocks.{i}.attn_ln.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ns]);
        push(format!("encoder.blocks.{i}.attn.query.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ns, ns]);
        push(format!("encoder.blocks.{i}.attn.query.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ns]);
        push(format!("encoder.blocks.{i}.attn.key.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ns, ns]);
        push(format!("encoder.blocks.{i}.attn.value.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ns, ns]);
        push(format!("encoder.blocks.{i}.attn.value.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ns]);
        push(format!("encoder.blocks.{i}.attn.out.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ns, ns]);
        push(format!("encoder.blocks.{i}.attn.out.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ns]);
    }

    push("decoder.positional_embedding".into(), F32, sys::ggml_op_GGML_OP_GET_ROWS, &[ts, i64::from(hparams.n_text_ctx)]);
    push("decoder.token_embedding.weight".into(), wtype, sys::ggml_op_GGML_OP_GET_ROWS, &[ts, i64::from(hparams.n_vocab)]);
    push("decoder.ln.weight".into(), F32, sys::ggml_op_GGML_OP_MUL, &[ts]);
    push("decoder.ln.bias".into(), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
    for i in 0..hparams.n_text_layer {
        push(format!("decoder.blocks.{i}.mlp_ln.weight"), F32, sys::ggml_op_GGML_OP_MUL, &[ts]);
        push(format!("decoder.blocks.{i}.mlp_ln.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
        push(format!("decoder.blocks.{i}.mlp.0.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ts, 4 * ts]);
        push(format!("decoder.blocks.{i}.mlp.0.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[4 * ts]);
        push(format!("decoder.blocks.{i}.mlp.2.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[4 * ts, ts]);
        push(format!("decoder.blocks.{i}.mlp.2.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
        push(format!("decoder.blocks.{i}.attn_ln.weight"), F32, sys::ggml_op_GGML_OP_MUL, &[ts]);
        push(format!("decoder.blocks.{i}.attn_ln.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
        push(format!("decoder.blocks.{i}.attn.query.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ts, ts]);
        push(format!("decoder.blocks.{i}.attn.query.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
        push(format!("decoder.blocks.{i}.attn.key.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ts, ts]);
        push(format!("decoder.blocks.{i}.attn.value.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ts, ts]);
        push(format!("decoder.blocks.{i}.attn.value.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
        push(format!("decoder.blocks.{i}.attn.out.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ts, ts]);
        push(format!("decoder.blocks.{i}.attn.out.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
        push(format!("decoder.blocks.{i}.cross_attn_ln.weight"), F32, sys::ggml_op_GGML_OP_MUL, &[ts]);
        push(format!("decoder.blocks.{i}.cross_attn_ln.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
        push(format!("decoder.blocks.{i}.cross_attn.query.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ts, ts]);
        push(format!("decoder.blocks.{i}.cross_attn.query.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
        push(format!("decoder.blocks.{i}.cross_attn.key.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ts, ts]);
        push(format!("decoder.blocks.{i}.cross_attn.value.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ts, ts]);
        push(format!("decoder.blocks.{i}.cross_attn.value.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
        push(format!("decoder.blocks.{i}.cross_attn.out.weight"), wtype, sys::ggml_op_GGML_OP_MUL_MAT, &[ts, ts]);
        push(format!("decoder.blocks.{i}.cross_attn.out.bias"), F32, sys::ggml_op_GGML_OP_ADD, &[ts]);
    }
    specs
}
