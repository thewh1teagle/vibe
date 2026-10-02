//! GGML graphs: the feature-stacking embedder, and one encoder + speaker-head step.
//!
//! Layouts are GGML order (`ne[0]` fastest): activations are `[hidden, frames]`,
//! which is row-major `[frames, hidden]` on the host.

use std::time::Instant;

use crate::model::{HParams, LayerWeights, Model};
use crate::runtime::{read_f32, Graph, Input, Runtime, Tensor};
use crate::{sys, Result};

const LAYER_NORM_EPS: f32 = 1e-5;
const F32: sys::ggml_type = sys::ggml_type_GGML_TYPE_F32;

/// Encoder frames per embedder graph, which bounds its compute buffer on long audio.
const EMBED_BLOCK: usize = 4096;

/// Stacks `subsampling_factor` mel frames and projects them: `[frames, mels]` -> `[enc_frames, hidden]`.
///
/// The time-major mel buffer, zero-padded to a multiple of the factor, already is the stacked input.
pub(crate) fn embed(model: &Model, runtime: &Runtime, mel: &[f32], num_mel_frames: usize) -> Result<Vec<f32>> {
    let h = &model.hparams;
    let started = Instant::now();
    let stacked_width = h.num_mels * h.subsampling_factor;
    let num_embeds = num_mel_frames.div_ceil(h.subsampling_factor);
    let mut stacked = mel.to_vec();
    stacked.resize(num_embeds * stacked_width, 0.0);

    let mut embeds = Vec::with_capacity(num_embeds * h.hidden_size);
    for start in (0..num_embeds).step_by(EMBED_BLOCK) {
        let frames = (num_embeds - start).min(EMBED_BLOCK);
        unsafe {
            let mut graph = Graph::new()?;
            let input = sys::ggml_new_tensor_2d(graph.ctx, F32, stacked_width as i64, frames as i64);
            let output = sys::ggml_mul_mat(graph.ctx, model.weights.embed, input);
            graph.output(output);
            let block = &stacked[start * stacked_width..(start + frames) * stacked_width];
            runtime.execute(&mut graph, &[(input, Input::F32(block))])?;
            embeds.extend_from_slice(&read_f32(output));
        }
    }
    tracing::debug!(
        mel_frames = num_mel_frames,
        enc_frames = num_embeds,
        ms = started.elapsed().as_secs_f64() * 1e3,
        "embedder"
    );
    Ok(embeds)
}

/// One encoder + head forward over `frames` encoder frames, kept for reuse while the step size repeats.
pub(crate) struct StepGraph {
    graph: Graph,
    pub frames: usize,
    input: Tensor,
    positions: Tensor,
    mask: Tensor,
    logits: Tensor,
    position_ids: Vec<i32>,
}

impl StepGraph {
    pub fn build(model: &Model, frames: usize) -> Result<Self> {
        let started = Instant::now();
        let h = &model.hparams;
        let n = frames as i64;
        unsafe {
            let mut graph = Graph::new()?;
            let ctx = graph.ctx;
            let input = sys::ggml_new_tensor_2d(ctx, F32, h.hidden_size as i64, n);
            let positions = sys::ggml_new_tensor_1d(ctx, sys::ggml_type_GGML_TYPE_I32, n);
            // Additive key-padding mask, `[keys, queries]`, broadcast over heads.
            let mask = sys::ggml_new_tensor_2d(ctx, F32, n, n);

            let w = &model.weights;
            let mut x = layer_norm(ctx, input, w.in_ln_w, w.in_ln_b);
            for layer in &w.layers {
                x = encoder_layer(ctx, h, layer, x, positions, mask);
            }
            x = layer_norm(ctx, x, w.out_ln_w, w.out_ln_b);
            let x = linear(ctx, x, w.proj_w, w.proj_b);
            let x = upsample(ctx, h, x, w.up_w, w.up_b);
            // Head: relu -> dense -> relu -> out_proj.
            let x = linear(ctx, sys::ggml_relu(ctx, x), w.dense_w, w.dense_b);
            let logits = linear(ctx, sys::ggml_relu(ctx, x), w.cls_w, w.cls_b);
            graph.output(logits);

            tracing::debug!(
                frames,
                nodes = sys::ggml_graph_n_nodes(graph.graph),
                ms = started.elapsed().as_secs_f64() * 1e3,
                "step graph built"
            );
            Ok(Self {
                graph,
                frames,
                input,
                positions,
                mask,
                logits,
                position_ids: (0..frames as i32).collect(),
            })
        }
    }

    /// Runs the step. `embeds` is `[frames, hidden]`, `valid` the key-padding mask.
    /// Returns logits `[frames * subsampling_factor, num_speakers]`.
    pub fn run(&mut self, runtime: &Runtime, embeds: &[f32], valid: &[bool]) -> Result<Vec<f32>> {
        let n = self.frames;
        let key_bias = valid
            .iter()
            .map(|&valid| if valid { 0.0 } else { f32::NEG_INFINITY })
            .collect::<Vec<_>>();
        let mut mask = Vec::with_capacity(n * n);
        for _ in 0..n {
            mask.extend_from_slice(&key_bias);
        }
        unsafe {
            runtime.execute(
                &mut self.graph,
                &[
                    (self.input, Input::F32(embeds)),
                    (self.positions, Input::I32(&self.position_ids)),
                    (self.mask, Input::F32(&mask)),
                ],
            )?;
            Ok(read_f32(self.logits))
        }
    }
}

unsafe fn layer_norm(ctx: *mut sys::ggml_context, x: Tensor, weight: Tensor, bias: Tensor) -> Tensor {
    let y = sys::ggml_norm(ctx, x, LAYER_NORM_EPS);
    sys::ggml_add(ctx, sys::ggml_mul(ctx, y, weight), bias)
}

unsafe fn linear(ctx: *mut sys::ggml_context, x: Tensor, weight: Tensor, bias: Tensor) -> Tensor {
    let y = sys::ggml_mul_mat(ctx, weight, x);
    if bias.is_null() {
        y
    } else {
        sys::ggml_add(ctx, y, bias)
    }
}

/// Pre-norm transformer layer: RoPE self-attention, then an exact-GELU MLP.
unsafe fn encoder_layer(
    ctx: *mut sys::ggml_context,
    h: &HParams,
    w: &LayerWeights,
    x: Tensor,
    positions: Tensor,
    mask: Tensor,
) -> Tensor {
    let n = (*x).ne[1];
    let heads = h.num_heads as i64;
    let head_dim = (h.hidden_size / h.num_heads) as i64;

    let a = layer_norm(ctx, x, w.ln1_w, w.ln1_b);
    let rope = |t: Tensor| {
        sys::ggml_rope_ext(
            ctx,
            sys::ggml_reshape_3d(ctx, t, head_dim, heads, n),
            positions,
            std::ptr::null_mut(),
            head_dim as i32,
            sys::GGML_ROPE_TYPE_NEOX as i32,
            0,
            h.rope_theta,
            1.0,
            0.0,
            1.0,
            0.0,
            0.0,
        )
    };
    let q = rope(sys::ggml_mul_mat(ctx, w.q, a));
    let k = rope(sys::ggml_mul_mat(ctx, w.k, a));
    let v = sys::ggml_reshape_3d(ctx, sys::ggml_mul_mat(ctx, w.v, a), head_dim, heads, n);

    // [head_dim, n, heads]
    let q = sys::ggml_permute(ctx, q, 0, 2, 1, 3);
    let k = sys::ggml_permute(ctx, k, 0, 2, 1, 3);
    // scores [keys, queries, heads]
    let scores = sys::ggml_mul_mat(ctx, k, q);
    let probs = sys::ggml_soft_max_ext(ctx, scores, mask, 1.0 / (head_dim as f32).sqrt(), 0.0);
    // v^T [keys, head_dim, heads]
    let v_t = sys::ggml_cont(ctx, sys::ggml_permute(ctx, v, 1, 2, 0, 3));
    // [head_dim, queries, heads] -> [head_dim, heads, queries] -> [hidden, n]
    let attended = sys::ggml_mul_mat(ctx, v_t, probs);
    let attended = sys::ggml_cont(ctx, sys::ggml_permute(ctx, attended, 0, 2, 1, 3));
    let attended = sys::ggml_reshape_2d(ctx, attended, h.hidden_size as i64, n);
    let x = sys::ggml_add(ctx, x, linear(ctx, attended, w.o_w, w.o_b));

    let m = layer_norm(ctx, x, w.ln2_w, w.ln2_b);
    let m = sys::ggml_gelu_erf(ctx, linear(ctx, m, w.fc1_w, w.fc1_b));
    sys::ggml_add(ctx, x, linear(ctx, m, w.fc2_w, w.fc2_b))
}

/// Sub-pixel upsampler: Conv1d(head, head * factor, k=3, pad=1), then `[head * factor, n]` -> `[head, n * factor]`.
unsafe fn upsample(ctx: *mut sys::ggml_context, h: &HParams, x: Tensor, weight: Tensor, bias: Tensor) -> Tensor {
    let hidden = h.head_hidden_size as i64;
    let out = hidden * h.subsampling_factor as i64;
    let n = (*x).ne[1];
    let zero = sys::ggml_fill(ctx, sys::ggml_new_tensor_2d(ctx, F32, hidden, 1), 0.0);
    let padded = sys::ggml_concat(ctx, sys::ggml_concat(ctx, zero, x, 1), zero, 1);

    let mut y: Tensor = std::ptr::null_mut();
    for tap in 0..3 {
        let w_tap = sys::ggml_view_2d(ctx, weight, hidden, out, (*weight).nb[1], tap * (*weight).nb[2]);
        let x_tap = sys::ggml_view_2d(ctx, padded, hidden, n, (*padded).nb[1], tap * (*padded).nb[1]);
        let term = sys::ggml_mul_mat(ctx, w_tap, x_tap);
        y = if y.is_null() { term } else { sys::ggml_add(ctx, y, term) };
    }
    let y = sys::ggml_add(ctx, y, bias);
    sys::ggml_reshape_2d(ctx, y, hidden, n * h.subsampling_factor as i64)
}
