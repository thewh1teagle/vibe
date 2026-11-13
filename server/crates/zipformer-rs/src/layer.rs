//! One Zipformer2 encoder layer as a GGML subgraph.
//!
//! Attention weights are `[source, target, heads]`: the softmax runs over the
//! first dimension, and `mul_mat` against them sums over source frames.

use crate::ops::{channels, conv_1d_depthwise, relative_shift, swoosh_l, swoosh_r, Builder, Tensor};
use crate::{sys, Result};

#[derive(Debug, Clone, Copy)]
pub(crate) struct LayerShape {
    pub dim: i64,
    pub heads: i64,
    pub query_dim: i64,
    pub value_dim: i64,
    pub pos_dim: i64,
    pub kernel: i64,
}

/// `src` is `[dim, time]`; `positions` is the stack's `[pos_dim, 2 * time - 1]` encoding.
pub(crate) unsafe fn layer(b: &mut Builder, name: &str, src: Tensor, positions: Tensor, shape: &LayerShape) -> Result<Tensor> {
    let ctx = b.ctx;
    let original = src;
    let attn = attention_weights(b, &format!("{name}.self_attn_weights"), src, positions, shape)?;

    let mut x = sys::ggml_add(ctx, src, feed_forward(b, &format!("{name}.feed_forward1"), src)?);
    x = sys::ggml_add(ctx, x, nonlin_attention(b, &format!("{name}.nonlin_attention"), x, attn)?);
    x = sys::ggml_add(ctx, x, self_attention(b, &format!("{name}.self_attn1"), x, attn, shape)?);
    x = sys::ggml_add(ctx, x, conv_module(b, &format!("{name}.conv_module1"), x, shape)?);
    x = sys::ggml_add(ctx, x, feed_forward(b, &format!("{name}.feed_forward2"), x)?);
    x = b.bypass(&format!("{name}.bypass_mid"), original, x)?;
    x = sys::ggml_add(ctx, x, self_attention(b, &format!("{name}.self_attn2"), x, attn, shape)?);
    x = sys::ggml_add(ctx, x, conv_module(b, &format!("{name}.conv_module2"), x, shape)?);
    x = sys::ggml_add(ctx, x, feed_forward(b, &format!("{name}.feed_forward3"), x)?);
    x = b.bias_norm(&format!("{name}.norm"), x)?;
    b.bypass(&format!("{name}.bypass"), original, x)
}

/// Splits `[width * heads, time]` into heads and moves them last: `[width, time, heads]`.
unsafe fn split_heads(b: &Builder, x: Tensor, width: i64, heads: i64) -> Tensor {
    let x = sys::ggml_reshape_3d(b.ctx, x, width, heads, (*x).ne[1]);
    sys::ggml_cont(b.ctx, sys::ggml_permute(b.ctx, x, 0, 2, 1, 3))
}

/// `softmax_j(q_i . k_j + p_i . P[time - 1 + j - i])`, with no `1/sqrt(d)`.
unsafe fn attention_weights(b: &Builder, name: &str, x: Tensor, positions: Tensor, shape: &LayerShape) -> Result<Tensor> {
    let ctx = b.ctx;
    let (heads, query, pos) = (shape.heads, shape.query_dim, shape.pos_dim);
    let projected = b.linear(&format!("{name}.in_proj"), x)?;
    let q = split_heads(b, channels(ctx, projected, 0, heads * query), query, heads);
    let k = split_heads(b, channels(ctx, projected, heads * query, heads * query), query, heads);
    let p = split_heads(b, channels(ctx, projected, 2 * heads * query, heads * pos), pos, heads);
    let content = sys::ggml_mul_mat(ctx, k, q);

    let table = sys::ggml_mul_mat(ctx, b.weight(&format!("{name}.linear_pos.weight"))?, positions);
    let table = split_heads(b, table, pos, heads);
    let relative = relative_shift(ctx, sys::ggml_mul_mat(ctx, table, p));
    Ok(sys::ggml_soft_max(ctx, sys::ggml_add(ctx, content, relative)))
}

unsafe fn feed_forward(b: &Builder, name: &str, x: Tensor) -> Result<Tensor> {
    let hidden = swoosh_l(b.ctx, b.linear(&format!("{name}.in_proj"), x)?);
    b.linear(&format!("{name}.out_proj"), hidden)
}

/// `out_proj((attn[head 0] @ (v * tanh(s))) * g)` with `(s, v, g)` the thirds of `in_proj(x)`.
unsafe fn nonlin_attention(b: &Builder, name: &str, x: Tensor, attn: Tensor) -> Result<Tensor> {
    let ctx = b.ctx;
    let time = (*x).ne[1];
    let projected = b.linear(&format!("{name}.in_proj"), x)?;
    let hidden = (*projected).ne[0] / 3;
    let s = channels(ctx, projected, 0, hidden);
    let v = channels(ctx, projected, hidden, hidden);
    let g = channels(ctx, projected, 2 * hidden, hidden);
    let values = sys::ggml_mul(ctx, v, sys::ggml_tanh(ctx, s));
    let values = sys::ggml_cont(ctx, sys::ggml_transpose(ctx, values));
    let head = sys::ggml_view_2d(ctx, attn, time, time, (*attn).nb[1], 0);
    let mixed = sys::ggml_mul(ctx, sys::ggml_mul_mat(ctx, values, head), g);
    b.linear(&format!("{name}.out_proj"), mixed)
}

/// `out_proj` of each head's values averaged with that head's attention weights.
unsafe fn self_attention(b: &Builder, name: &str, x: Tensor, attn: Tensor, shape: &LayerShape) -> Result<Tensor> {
    let ctx = b.ctx;
    let time = (*x).ne[1];
    let (heads, width) = (shape.heads, shape.value_dim);
    let values = b.linear(&format!("{name}.in_proj"), x)?;
    let values = sys::ggml_reshape_3d(ctx, values, width, heads, time);
    let values = sys::ggml_cont(ctx, sys::ggml_permute(ctx, values, 1, 2, 0, 3));
    let mixed = sys::ggml_mul_mat(ctx, values, attn);
    let mixed = sys::ggml_cont(ctx, sys::ggml_permute(ctx, mixed, 0, 2, 1, 3));
    b.linear(
        &format!("{name}.out_proj"),
        sys::ggml_reshape_2d(ctx, mixed, width * heads, time),
    )
}

/// `out_proj(SwooshR(depthwise(a * sigmoid(s))))` with `(a, s)` the halves of `in_proj(x)`.
unsafe fn conv_module(b: &mut Builder, name: &str, x: Tensor, shape: &LayerShape) -> Result<Tensor> {
    let ctx = b.ctx;
    let dim = shape.dim;
    let projected = b.linear(&format!("{name}.in_proj"), x)?;
    let gate = sys::ggml_sigmoid(ctx, channels(ctx, projected, dim, dim));
    let gated = sys::ggml_mul(ctx, channels(ctx, projected, 0, dim), gate);
    let gated = sys::ggml_cont(ctx, sys::ggml_transpose(ctx, gated));
    let convolved = chunk_causal_conv(b, &format!("{name}.depthwise_conv"), gated, shape)?;
    let convolved = sys::ggml_cont(ctx, sys::ggml_transpose(ctx, convolved));
    b.linear(&format!("{name}.out_proj"), swoosh_r(ctx, convolved))
}

/// The chunk-causal depthwise convolution with the whole sequence as one
/// chunk: a causal half-kernel convolution plus a same-padded one whose
/// output, bias included, is rescaled near both ends. `x` is `[time, dim]`.
///
/// The edge scale and both biases depend only on the weights and the length,
/// so they are folded on the host into `out = same * scale + causal + offset`.
unsafe fn chunk_causal_conv(b: &mut Builder, name: &str, x: Tensor, shape: &LayerShape) -> Result<Tensor> {
    let ctx = b.ctx;
    let (time, dim, kernel) = ((*x).ne[0], shape.dim, shape.kernel);
    let half = (kernel / 2) as i32;

    let causal = conv_1d_depthwise(ctx, b.weight(&format!("{name}.causal_conv.weight"))?, x, half);
    let causal = sys::ggml_cont(ctx, sys::ggml_view_2d(ctx, causal, time, dim, (*causal).nb[1], 0));
    let same = conv_1d_depthwise(ctx, b.weight(&format!("{name}.chunkwise_conv.weight"))?, x, half);

    let edges = b.host(&format!("{name}.chunkwise_conv_scale"))?;
    let causal_bias = b.host(&format!("{name}.causal_conv.bias"))?;
    let same_bias = b.host(&format!("{name}.chunkwise_conv.bias"))?;
    let (time_u, dim_u, kernel_u) = (time as usize, dim as usize, kernel as usize);
    let mut scale = vec![1.0f32; time_u * dim_u];
    let mut offset = vec![0.0f32; time_u * dim_u];
    for channel in 0..dim_u {
        let head = &edges[channel * kernel_u..(channel + 1) * kernel_u];
        let tail = &edges[(dim_u + channel) * kernel_u..(dim_u + channel + 1) * kernel_u];
        let row = channel * time_u;
        if time_u >= kernel_u {
            for tap in 0..kernel_u {
                scale[row + tap] += head[tap];
                scale[row + time_u - kernel_u + tap] += tail[tap];
            }
        } else {
            for frame in 0..time_u {
                scale[row + frame] += head[frame] + tail[kernel_u - time_u + frame];
            }
        }
        for frame in 0..time_u {
            offset[row + frame] = same_bias[channel] * scale[row + frame] + causal_bias[channel];
        }
    }
    let scale = b.input(&[time, dim], scale);
    let offset = b.input(&[time, dim], offset);
    let scaled = sys::ggml_add(ctx, sys::ggml_mul(ctx, same, scale), causal);
    Ok(sys::ggml_add(ctx, scaled, offset))
}
