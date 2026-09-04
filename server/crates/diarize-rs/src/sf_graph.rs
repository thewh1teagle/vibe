//! The two Sortformer graphs, and the thin driver that runs them.
//!
//! NeMo's streaming Sortformer splits the encoder in half so the AOSC speaker
//! cache can hold *pre-encode* embeddings across chunks:
//!
//! ```text
//! Graph A  mel window [n_mels, M]  -> pre_encode -> chunk embeddings [512, T_diar]
//!          (host: concat [spkcache | fifo | chunk] -> [512, T_concat])
//! Graph B  concat -> xscale -> 17 conformer blocks -> encoder_proj(512->192)
//!                  -> 18 post-LN transformer blocks -> diar head
//!                  -> preds [n_spk, T_concat]
//! ```
//!
//! Ported from `plans/transcribe.cpp/src/arch/sortformer/model.cpp`
//! (`build_pre_encode_graph`, `build_stream_infer_graph`). The two outputs are
//! exactly the `chunk_pre_encode_embs` / `spkcache_fifo_chunk_preds` pair the
//! existing ONNX host state machine in `parakeet_rs::sortformer` consumes, so
//! that AOSC/FIFO code can be repointed here unchanged.
//!
//! Three placement traps, all reproduced from the reference:
//!
//! 1. **xscale belongs to Graph B.** `sqrt(d_model)` is applied to the
//!    concatenated sequence, not inside pre_encode — the cache therefore
//!    stores raw, unscaled pre-encode output (`model.cpp:475`). Scaling in
//!    Graph A would scale cached frames twice.
//! 2. **The rel-pos table spans the concat.** It is rebuilt every chunk over
//!    `2 * T_concat - 1` centred positions (`model.cpp:936`).
//! 3. **Attention over the concat is unrestricted.** No sliding window, no
//!    chunk mask (`model.cpp:487-489`).

use crate::sf_ops::{add_conv_bias, conformer_block, conv_2d_depthwise, sys, Context, Tensor};
use crate::sf_runtime::{Graph, Runtime};
use crate::sf_transformer::{diar_head, encoder_proj, rel_pos_table, transformer_block};
use crate::sf_weights::{PreEncodeView, SfResult, SortformerWeights};

/// Pad one frequency/time frame on each side, the offline (non-causal)
/// `(k-1)/2` padding for the k=3 subsampling convs. Verbatim from
/// `crates/parakeet-rs/src/encoder.rs:5`. NeMo's cache-aware streaming would
/// use causal `(k-1, stride-1)` padding here instead; Sortformer does not —
/// its pre_encode is the offline one (`model.cpp:sf_conv_policy`, which sets
/// `causal_pre_encode = false`).
unsafe fn symmetric_pad(ctx: Context, mut x: Tensor) -> Tensor {
    let ty = (*x).type_;
    let left = sys::ggml_fill(
        ctx,
        sys::ggml_new_tensor_4d(ctx, ty, 1, (*x).ne[1], (*x).ne[2], (*x).ne[3]),
        0.0,
    );
    x = sys::ggml_concat(ctx, left, x, 0);
    let right = sys::ggml_fill(
        ctx,
        sys::ggml_new_tensor_4d(ctx, ty, 1, (*x).ne[1], (*x).ne[2], (*x).ne[3]),
        0.0,
    );
    x = sys::ggml_concat(ctx, x, right, 0);
    let top = sys::ggml_fill(
        ctx,
        sys::ggml_new_tensor_4d(ctx, ty, (*x).ne[0], 1, (*x).ne[2], (*x).ne[3]),
        0.0,
    );
    x = sys::ggml_concat(ctx, top, x, 1);
    let bottom = sys::ggml_fill(
        ctx,
        sys::ggml_new_tensor_4d(ctx, ty, (*x).ne[0], 1, (*x).ne[2], (*x).ne[3]),
        0.0,
    );
    sys::ggml_concat(ctx, x, bottom, 1)
}

/// DwStridingSubsampling stem: conv -> relu -> (depthwise, pointwise, relu) x2
/// -> flatten -> Linear. Subsampling factor 8, 256 channels.
///
/// `mel` is `[frames, n_mels, 1, 1]` (ggml ne order: time fastest), which is
/// mel-major host layout `mel_index * frames + frame`. Output is
/// `[d_model, frames / 8]`.
pub(crate) unsafe fn build_pre_encode(ctx: Context, w: &PreEncodeView, mel: Tensor) -> Tensor {
    let mut x = sys::ggml_cont(ctx, sys::ggml_permute(ctx, mel, 1, 0, 2, 3));
    x = symmetric_pad(ctx, x);
    x = sys::ggml_conv_2d(ctx, w.conv0_w, x, 2, 2, 0, 0, 1, 1);
    x = sys::ggml_relu(ctx, add_conv_bias(ctx, x, w.conv0_b));

    x = symmetric_pad(ctx, x);
    x = conv_2d_depthwise(ctx, w.conv2_w, x, 2, 2, 0, 0);
    x = add_conv_bias(ctx, x, w.conv2_b);
    x = sys::ggml_conv_2d(ctx, w.conv3_w, x, 1, 1, 0, 0, 1, 1);
    x = sys::ggml_relu(ctx, add_conv_bias(ctx, x, w.conv3_b));

    x = symmetric_pad(ctx, x);
    x = conv_2d_depthwise(ctx, w.conv5_w, x, 2, 2, 0, 0);
    x = add_conv_bias(ctx, x, w.conv5_b);
    x = sys::ggml_conv_2d(ctx, w.conv6_w, x, 1, 1, 0, 0, 1, 1);
    x = sys::ggml_relu(ctx, add_conv_bias(ctx, x, w.conv6_b));

    // [freq, time, channels] -> [freq * channels, time] -> Linear -> d_model.
    let freq = (*x).ne[0];
    let time = (*x).ne[1];
    let channels = (*x).ne[2];
    let batch = (*x).ne[3];
    x = sys::ggml_cont(ctx, sys::ggml_permute(ctx, x, 0, 2, 1, 3));
    x = sys::ggml_reshape_3d(ctx, x, freq * channels, time, batch);
    x = sys::ggml_mul_mat(ctx, w.out_w, x);
    let bias = sys::ggml_reshape_4d(ctx, w.out_b, (*w.out_b).ne[0], 1, 1, 1);
    sys::ggml_add(ctx, x, bias)
}

/// Graph A handles: the mel window input and the pre-encode embeddings.
pub(crate) struct PreEncodeBuild {
    pub mel: Tensor,
    pub output: Tensor,
}

/// Build Graph A over a mel window of `frames` frames.
pub(crate) unsafe fn build_pre_encode_graph(graph: &mut Graph, model: &SortformerWeights, frames: i64) -> PreEncodeBuild {
    let mel = sys::ggml_new_tensor_4d(
        graph.ctx,
        sys::ggml_type_GGML_TYPE_F32,
        frames,
        model.hparams().fe_num_mels,
        1,
        1,
    );
    let output = build_pre_encode(graph.ctx, model.pre_encode(), mel);
    graph.output(output);
    PreEncodeBuild { mel, output }
}

/// Graph B handles: the concatenated embeddings, the rel-pos table, and the
/// per-frame speaker probabilities.
pub(crate) struct InferBuild {
    pub concat: Tensor,
    pub position: Tensor,
    pub preds: Tensor,
    /// FastConformer stack output, `[enc_d_model, T_concat]`.
    pub conformer_out: Tensor,
    /// `encoder_proj` output, `[tf_d_model, T_concat]`.
    pub proj_out: Tensor,
    /// Transformer stack output, `[tf_d_model, T_concat]`.
    pub tf_out: Tensor,
}

/// Build Graph B over a `[spkcache | fifo | chunk]` concat of `t_concat`
/// frames.
pub(crate) unsafe fn build_infer_graph(
    graph: &mut Graph,
    model: &SortformerWeights,
    t_concat: i64,
    keep_stages: bool,
) -> InferBuild {
    let hp = model.hparams();
    let ctx = graph.ctx;
    let d_model = hp.enc_d_model;

    let concat = sys::ggml_new_tensor_2d(ctx, sys::ggml_type_GGML_TYPE_F32, d_model, t_concat);
    // xscaling: NEST FastConformer multiplies the encoder input by
    // sqrt(d_model). It applies to the whole concat because the cache holds
    // unscaled embeddings (see the module docs).
    let mut x = sys::ggml_scale(ctx, concat, (d_model as f32).sqrt());

    // Rel-pos table over the concatenated sequence: 2*T_concat-1 positions.
    let position = sys::ggml_new_tensor_2d(ctx, sys::ggml_type_GGML_TYPE_F32, d_model, 2 * t_concat - 1);

    // The GPU path uses flash attention; the CPU path takes the manual
    // mul_mat + soft_max route, which is the reference's bit-exact fallback.
    let flash = !model.promote_pointwise();
    for block in model.blocks() {
        x = conformer_block(
            ctx,
            x,
            position,
            block,
            d_model,
            hp.enc_heads,
            hp.enc_conv_kernel,
            flash,
            model.promote_pointwise(),
        );
    }

    // encoder_proj 512 -> 192, then the post-LN transformer stack. There is no
    // final LayerNorm: pre_ln=false means NeMo never creates one.
    let conformer_out = x;
    let head = model.head();
    let mut t = encoder_proj(ctx, x, head.enc_proj_w, head.enc_proj_b);
    let proj_out = t;
    // The transformer block helper works on [d, T]; drop the unit batch axis.
    t = sys::ggml_reshape_2d(ctx, t, hp.tf_d_model, t_concat);
    for block in model.tf_blocks() {
        t = transformer_block(ctx, t, block, hp.tf_d_model, hp.tf_heads);
    }

    let tf_out = t;
    let preds = diar_head(ctx, t, head);
    graph.output(preds);
    if keep_stages {
        // Marking them as graph outputs is what stops the allocator from
        // recycling their buffers into later ops.
        graph.output(conformer_out);
        graph.output(proj_out);
        graph.output(tf_out);
    }
    InferBuild {
        concat,
        position,
        preds,
        conformer_out,
        proj_out,
        tf_out,
    }
}

/// One streaming chunk's forward pass, as the host state machine sees it.
pub struct ChunkOutput {
    /// Pre-encode embeddings for this chunk, row-major `[T_diar, enc_d_model]`
    /// — NeMo's `chunk_pre_encode_embs`, and what the AOSC cache/FIFO store.
    pub embeddings: Vec<f32>,
    pub embedding_frames: usize,
    /// Speaker probabilities over the whole concat, row-major
    /// `[T_concat, n_spk]` — NeMo's `spkcache_fifo_chunk_preds`.
    pub predictions: Vec<f32>,
    pub prediction_frames: usize,
}

/// Runs Graph A then Graph B for one chunk.
///
/// `mel` is the chunk's mel window in host layout `[n_mels][frames]`
/// (mel-major, i.e. `mel[m * frames + f]`), which is what the ggml
/// `[frames, n_mels]` input tensor expects verbatim. `cache` is the
/// `[spkcache | fifo]` prefix already concatenated by the caller, row-major
/// `[n_cached, enc_d_model]`; pass an empty slice for the first chunk.
///
/// Both graphs are rebuilt per chunk because `T_diar` and `T_concat` change as
/// the cache fills — the same thing the C++ does (`model.cpp:865-880`).
pub fn run_chunk(model: &SortformerWeights, mel: &[f32], mel_frames: usize, cache: &[f32]) -> SfResult<ChunkOutput> {
    run_chunk_inner(model, mel, mel_frames, mel_frames, cache, false).map(|(output, _)| output)
}

/// [`run_chunk`] for a window whose tail is zero padding.
///
/// The last chunk of a recording rarely fills the window, so the host pads it
/// with zeros and tells the graph how many frames are real. ONNX carried that
/// as the `chunk_lengths` input, which NeMo turns into the encoder pad mask:
/// padded positions are excluded from attention and zeroed before the depthwise
/// conv. This graph has no mask, so it achieves the same thing by dropping the
/// padded frames from the pre-encode output before the concat is built —
/// equivalent, because every remaining op is either pointwise, an attention
/// whose masked keys are simply absent, or a conv whose right edge is
/// zero-padded either way.
///
/// Without this, the padded frames are real (garbage) tokens that every valid
/// frame attends to; measured against the ONNX baseline that was worth up to
/// 0.26 absolute on the final chunk.
pub fn run_chunk_valid(
    model: &SortformerWeights,
    mel: &[f32],
    mel_frames: usize,
    valid_mel_frames: usize,
    cache: &[f32],
) -> SfResult<ChunkOutput> {
    run_chunk_inner(model, mel, mel_frames, valid_mel_frames, cache, false).map(|(output, _)| output)
}

/// One named intermediate tensor, in the row-major layout the `baseline/`
/// dumps use (`shape` is ggml `ne` reversed).
pub struct Stage {
    pub name: &'static str,
    pub shape: Vec<usize>,
    pub data: Vec<f32>,
}

/// Same forward pass as [`run_chunk`], but also returns the intermediate
/// tensors a per-stage parity check against NeMo needs: pre_encode output,
/// FastConformer output, `encoder_proj` output, transformer output and the
/// final sigmoid predictions.
pub fn run_chunk_stages(
    model: &SortformerWeights,
    mel: &[f32],
    mel_frames: usize,
    cache: &[f32],
) -> SfResult<(ChunkOutput, Vec<Stage>)> {
    run_chunk_inner(model, mel, mel_frames, mel_frames, cache, true)
}

unsafe fn read_stage(graph: &Graph, name: &'static str, tensor: Tensor) -> Stage {
    let ne = (*tensor).ne;
    let mut shape: Vec<usize> = ne.iter().rev().map(|&n| n as usize).collect();
    while shape.len() > 2 && shape[0] == 1 {
        shape.remove(0);
    }
    Stage {
        name,
        shape,
        data: graph.read(tensor),
    }
}

fn run_chunk_inner(
    model: &SortformerWeights,
    mel: &[f32],
    mel_frames: usize,
    valid_mel_frames: usize,
    cache: &[f32],
    stages: bool,
) -> SfResult<(ChunkOutput, Vec<Stage>)> {
    let d_model = model.hparams().enc_d_model as usize;
    let runtime = Runtime::new(model.backend())?;
    let mut dumps = Vec::new();

    // ---- Graph A: pre_encode over the mel window ----
    let (embeddings, t_diar) = unsafe {
        let mut graph = Graph::new()?;
        let build = build_pre_encode_graph(&mut graph, model, mel_frames as i64);
        runtime.execute(&mut graph, &[(build.mel, mel)])?;
        let frames = (*build.output).ne[1] as usize;
        if stages {
            dumps.push(read_stage(&graph, "pre_encode", build.output));
        }
        (graph.read(build.output), frames)
    };

    // Drop the frames that came out of the zero-padded tail of the window.
    // The stem subsamples by `mel_frames / t_diar`, and NeMo computes the valid
    // output length the same ceil-divide way.
    let subsampling = (mel_frames / t_diar).max(1);
    let t_diar = valid_mel_frames.div_ceil(subsampling).min(t_diar);
    let embeddings = {
        let mut embeddings = embeddings;
        embeddings.truncate(t_diar * d_model);
        embeddings
    };

    // ---- host concat [spkcache | fifo | chunk] ----
    let cached = cache.len() / d_model;
    let t_concat = cached + t_diar;
    let mut concat = Vec::with_capacity(t_concat * d_model);
    concat.extend_from_slice(cache);
    concat.extend_from_slice(&embeddings);

    // ---- Graph B: xscale + conformer + proj + transformer + head ----
    let predictions = unsafe {
        let mut graph = Graph::new()?;
        let build = build_infer_graph(&mut graph, model, t_concat as i64, stages);
        let position = rel_pos_table(d_model, t_concat);
        runtime.execute(&mut graph, &[(build.concat, &concat), (build.position, &position)])?;
        let preds = graph.read(build.preds);
        if stages {
            dumps.push(read_stage(&graph, "conformer", build.conformer_out));
            dumps.push(read_stage(&graph, "encoder_proj", build.proj_out));
            dumps.push(read_stage(&graph, "transformer", build.tf_out));
            dumps.push(read_stage(&graph, "preds", build.preds));
        }
        preds
    };

    Ok((
        ChunkOutput {
            embeddings,
            embedding_frames: t_diar,
            predictions,
            prediction_frames: t_concat,
        },
        dumps,
    ))
}
