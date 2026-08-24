//! The Sortformer-specific half of the forward pass: `encoder_proj`, the
//! 18-layer POST-LN Transformer encoder, the 4-way sigmoid diarization head,
//! and the host-side relative-position table the FastConformer consumes.
//!
//! Nothing in `crates/parakeet-rs` covers any of this — Parakeet's encoder
//! output feeds a TDT decoder instead. Ported from
//! `plans/transcribe.cpp/src/arch/sortformer/model.cpp` (`tf_block`,
//! `fill_rel_pos_emb`, and the head inside `build_stream_infer_graph`).

use crate::sf_ops::{layer_norm, linear, sigmoid, sys, Context, Tensor};
use crate::sf_weights::{DiarHeadView, TransformerBlockView};

/// `encoder_proj`: Linear(enc_d_model -> tf_d_model), i.e. 512 -> 192.
/// Applied to the FastConformer output before the transformer stack
/// (`model.cpp:501`).
pub(crate) unsafe fn encoder_proj(ctx: Context, x: Tensor, w: Tensor, b: Tensor) -> Tensor {
    linear(ctx, w, x, b)
}

/// One POST-LN Transformer encoder block (NeMo `TransformerEncoder` with
/// `pre_ln=false`): self-attention with no positional encoding and no mask,
/// residual, LayerNorm; then FFN with ReLU, residual, LayerNorm.
///
/// `x` is `[d_model, T]` (optionally `[d_model, T, 1]`); the result has the
/// same shape.
///
/// The one trap here is the attention scale. NeMo's `MultiHeadAttention`
/// divides **both** q and k by `head_dim ** 0.25` before the score matmul:
///
/// ```text
/// attn_scale = sqrt(sqrt(head_dim))
/// scores = (q / attn_scale) @ (k / attn_scale)^T = q @ k^T / sqrt(head_dim)
/// ```
///
/// which is the ordinary `1/sqrt(d_k)` overall, but applying it as a single
/// post-matmul scale is *not* what the reference does and drifts in f16. We
/// follow the C++ (`model.cpp:284-325`) and pre-divide each of q and k.
///
/// There is deliberately no final LayerNorm after the stack: `pre_ln=false`
/// means NeMo never allocates `final_layer_norm`, so the last block's
/// `norm_2` is the end of the encoder.
pub(crate) unsafe fn transformer_block(ctx: Context, x: Tensor, b: &TransformerBlockView, d_model: i64, heads: i64) -> Tensor {
    let time = (*x).ne[1];
    let head_dim = d_model / heads;
    // head_dim ** 0.25, applied to q and to k separately.
    let inv_scale = 1.0 / (head_dim as f32).sqrt().sqrt();

    let residual = x;

    let q = linear(ctx, b.attn_q_w, x, b.attn_q_b);
    let k = linear(ctx, b.attn_k_w, x, b.attn_k_b);
    let v = linear(ctx, b.attn_v_w, x, b.attn_v_b);

    // [d, T] -> [head_dim, n_head, T] -> [head_dim, T, n_head].
    let q = sys::ggml_cont(
        ctx,
        sys::ggml_permute(ctx, sys::ggml_reshape_3d(ctx, q, head_dim, heads, time), 0, 2, 1, 3),
    );
    let k = sys::ggml_cont(
        ctx,
        sys::ggml_permute(ctx, sys::ggml_reshape_3d(ctx, k, head_dim, heads, time), 0, 2, 1, 3),
    );
    let v = sys::ggml_cont(
        ctx,
        sys::ggml_permute(ctx, sys::ggml_reshape_3d(ctx, v, head_dim, heads, time), 0, 2, 1, 3),
    );

    let q = sys::ggml_scale(ctx, q, inv_scale);
    let k = sys::ggml_scale(ctx, k, inv_scale);

    // [T_k, T_q, n_head]; softmax runs over the keys (ne[0]). No mask: in the
    // Sortformer sync-streaming path every frame of the concat is valid.
    let kq = sys::ggml_mul_mat(ctx, k, q);
    let kq = sys::ggml_soft_max(ctx, kq);

    let vt = sys::ggml_cont(ctx, sys::ggml_permute(ctx, v, 1, 0, 2, 3));
    let attn = sys::ggml_mul_mat(ctx, vt, kq);
    // [head_dim, T_q, n_head] -> [head_dim, n_head, T] -> [d_model, T].
    let attn = sys::ggml_cont(ctx, sys::ggml_permute(ctx, attn, 0, 2, 1, 3));
    let attn = sys::ggml_reshape_2d(ctx, attn, d_model, time);
    let attn = linear(ctx, b.attn_o_w, attn, b.attn_o_b);

    // Post-LN: residual first, normalise after.
    let x = sys::ggml_add(ctx, attn, residual);
    let x = layer_norm(ctx, x, b.norm1_w, b.norm1_b);

    let residual = x;
    let f = linear(ctx, b.ff_in_w, x, b.ff_in_b);
    let f = sys::ggml_relu(ctx, f);
    let f = linear(ctx, b.ff_out_w, f, b.ff_out_b);
    let x = sys::ggml_add(ctx, f, residual);
    layer_norm(ctx, x, b.norm2_w, b.norm2_b)
}

/// Diarization head (`forward_speaker_sigmoids`): `relu -> Linear(192, 192) ->
/// relu -> Linear(192, 4) -> sigmoid`, producing `[n_spk, T]` probabilities.
///
/// NeMo multiplies by the encoder mask before the head; in sync streaming
/// every frame is valid, so the C++ drops it (`model.cpp:507-513`) and so do we.
///
/// `single_spk_head` is the offline / single-chunk head. The 2*hidden
/// NVIDIA's converter omits the unused 2*hidden `hidden_to_spks` head entirely.
pub(crate) unsafe fn diar_head(ctx: Context, x: Tensor, head: &DiarHeadView) -> Tensor {
    let h = sys::ggml_relu(ctx, x);
    let h = linear(ctx, head.fc1_w, h, head.fc1_b);
    let h = sys::ggml_relu(ctx, h);
    let s = linear(ctx, head.single_spk_head_w, h, head.single_spk_head_b);
    sigmoid(ctx, s)
}

/// Sinusoidal relative-position table for a sequence of `time` frames, laid
/// out `[d_model, 2*time - 1]` row-major (row `i` = one position vector).
///
/// Built per call over the CONCATENATED `[spkcache | fifo | chunk]` sequence,
/// not over the chunk: `T` here is `T_concat` (`model.cpp:936`). Positions are
/// centred, running from `+zero` down to `-zero` where `zero = (len - 1) / 2`,
/// so row `zero` is relative offset 0.
///
/// Identical to `parakeet-rs::encoder::positional_embedding`
/// (`crates/parakeet-rs/src/encoder.rs:165`) and to `fill_rel_pos_emb`
/// (`model.cpp:412`); duplicated because that function is `pub(crate)` in a
/// crate diarize-rs cannot reach into.
pub(crate) fn rel_pos_table(d_model: usize, time: usize) -> Vec<f32> {
    let length = 2 * time - 1;
    let zero = (length - 1) / 2;
    let mut result = vec![0.0f32; length * d_model];
    for i in 0..length {
        let position = (zero as isize - i as isize) as f32;
        for k in 0..d_model / 2 {
            let div = ((2 * k) as f32 * (-10000.0f32.ln() / d_model as f32)).exp();
            result[i * d_model + 2 * k] = (position * div).sin();
            result[i * d_model + 2 * k + 1] = (position * div).cos();
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::rel_pos_table;

    #[test]
    fn rel_pos_table_is_centred() {
        let d = 8;
        let t = 5;
        let table = rel_pos_table(d, t);
        assert_eq!(table.len(), d * (2 * t - 1));
        // The centre row is relative offset 0: sin(0)=0, cos(0)=1.
        let centre = (2 * t - 1 - 1) / 2;
        for k in 0..d / 2 {
            assert!(table[centre * d + 2 * k].abs() < 1e-6);
            assert!((table[centre * d + 2 * k + 1] - 1.0).abs() < 1e-6);
        }
    }
}
