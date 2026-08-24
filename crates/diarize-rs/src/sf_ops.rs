//! Unsafe GGML graph primitives for the Sortformer port.
//!
//! These mirror `crates/parakeet-rs/src/ops.rs` op for op — same layouts, same
//! op choices, same workarounds — with one systematic difference: Sortformer's
//! NEST FastConformer is a `use_bias=true` NeMo ConformerEncoder, so every
//! linear and every conv here carries an optional bias tensor. The parakeet-rs
//! graph drops those adds entirely (see plans/diarize-gguf/PORT_NOTES.md), which is correct only
//! for a bias-free encoder.
//!
//! Reference: `plans/transcribe.cpp/src/conformer/conformer.cpp`
//! (`rel_pos_mhsa`, `conv_module`, `macaron_ff_residual`).

use crate::sf_weights::ConformerBlockView;

pub(crate) use whisper_cpp_sys as sys;

pub(crate) type Tensor = *mut sys::ggml_tensor;
pub(crate) type Context = *mut sys::ggml_context;

/// NeMo defaults for both LayerNorm and BatchNorm. Neither is stored in the
/// GGUF, so they are hardcoded to match (`conformer.h:kLayerNormEps`).
pub(crate) const NORM_EPS: f32 = 1.0e-5;

pub(crate) unsafe fn layer_norm(ctx: Context, x: Tensor, gamma: Tensor, beta: Tensor) -> Tensor {
    let mut y = sys::ggml_norm(ctx, x, NORM_EPS);
    y = sys::ggml_mul(ctx, y, gamma);
    if !beta.is_null() {
        y = sys::ggml_add(ctx, y, beta);
    }
    y
}

/// `y = W x + b`. GGUF linear weights are PyTorch `[out, in]` written
/// row-major, i.e. ggml `ne = [in, out]`, which is exactly what `mul_mat`
/// wants. A null `bias` skips the add.
pub(crate) unsafe fn linear(ctx: Context, w: Tensor, x: Tensor, bias: Tensor) -> Tensor {
    let mut y = sys::ggml_mul_mat(ctx, w, x);
    if !bias.is_null() {
        y = sys::ggml_add(ctx, y, bias);
    }
    y
}

/// `sigmoid(x) = 1 / (1 + exp(-x))` built from universally supported
/// primitives. The C++ reference calls `ggml_sigmoid` directly, but several
/// GGML GPU backends reject the standalone SIGMOID op, so parakeet-rs spells
/// it out (ops.rs:203-209) and we follow that precedent. Numerically identical.
pub(crate) unsafe fn sigmoid(ctx: Context, x: Tensor) -> Tensor {
    let x = sys::ggml_cont(ctx, x);
    let neg = sys::ggml_scale(ctx, x, -1.0);
    let exp = sys::ggml_exp(ctx, neg);
    let ones = sys::ggml_fill(ctx, sys::ggml_dup_tensor(ctx, exp), 1.0);
    sys::ggml_div(ctx, ones, sys::ggml_add(ctx, ones, exp))
}

/// `Linear2(SiLU(Linear1(x)))` — the conformer's macaron feed-forward body.
pub(crate) unsafe fn feed_forward(ctx: Context, x: Tensor, w1: Tensor, b1: Tensor, w2: Tensor, b2: Tensor) -> Tensor {
    let y = linear(ctx, w1, x, b1);
    let y = sys::ggml_silu(ctx, y);
    linear(ctx, w2, y, b2)
}

/// `x + 0.5 * FeedForward(LayerNorm(x))`.
#[allow(clippy::too_many_arguments)]
pub(crate) unsafe fn macaron(
    ctx: Context,
    x: Tensor,
    norm_w: Tensor,
    norm_b: Tensor,
    w1: Tensor,
    b1: Tensor,
    w2: Tensor,
    b2: Tensor,
) -> Tensor {
    let y = layer_norm(ctx, x, norm_w, norm_b);
    let y = feed_forward(ctx, y, w1, b1, w2, b2);
    let y = sys::ggml_scale(ctx, y, 0.5);
    sys::ggml_add(ctx, x, y)
}

/// Transformer-XL relative-position skew: turns `[pos_len, T_q, H, B]` scores
/// into a matrix whose column `k` holds the score for relative offset `k`.
/// Verbatim from parakeet-rs `ops.rs:47`.
pub(crate) unsafe fn rel_shift(ctx: Context, x: Tensor) -> Tensor {
    let ne = (*x).ne;
    let pos = ne[0];
    let tq = ne[1];
    let heads = ne[2];
    let batch = ne[3];
    let template = sys::ggml_new_tensor_4d(ctx, sys::ggml_type_GGML_TYPE_F32, 1, tq, heads, batch);
    let zeros = sys::ggml_fill(ctx, template, 0.0);
    let mut y = sys::ggml_concat(ctx, zeros, x, 0);
    y = sys::ggml_reshape_4d(ctx, y, tq, pos + 1, heads, batch);
    y = sys::ggml_view_4d(ctx, y, tq, pos, heads, batch, (*y).nb[1], (*y).nb[2], (*y).nb[3], (*y).nb[1]);
    y = sys::ggml_cont(ctx, y);
    sys::ggml_reshape_4d(ctx, y, pos, tq, heads, batch)
}

/// Add a 1-D conv bias `[C]` to a 4-D conv output `[W, H, C, N]`.
pub(crate) unsafe fn add_conv_bias(ctx: Context, output: Tensor, bias: Tensor) -> Tensor {
    if bias.is_null() {
        return output;
    }
    let bias = sys::ggml_reshape_4d(ctx, bias, 1, 1, (*bias).ne[0], 1);
    sys::ggml_add(ctx, output, bias)
}

/// im2col depthwise 2-D convolution. Verbatim from parakeet-rs `ops.rs:70`.
pub(crate) unsafe fn conv_2d_depthwise(
    ctx: Context,
    kernel: Tensor,
    data: Tensor,
    stride0: i32,
    stride1: i32,
    pad0: i32,
    pad1: i32,
) -> Tensor {
    let mut a = sys::ggml_reshape_4d(
        ctx,
        kernel,
        (*kernel).ne[0],
        (*kernel).ne[1],
        1,
        (*kernel).ne[2] * (*kernel).ne[3],
    );
    let data4 = sys::ggml_reshape_4d(ctx, data, (*data).ne[0], (*data).ne[1], 1, (*data).ne[2] * (*data).ne[3]);
    let cols = sys::ggml_im2col(ctx, a, data4, stride0, stride1, pad0, pad1, 1, 1, true, (*kernel).type_);
    let b = sys::ggml_reshape_4d(
        ctx,
        cols,
        (*cols).ne[0],
        (*cols).ne[2] * (*cols).ne[1],
        (*data).ne[2],
        (*data).ne[3],
    );
    a = sys::ggml_reshape_4d(ctx, a, (*a).ne[0] * (*a).ne[1], (*a).ne[2], (*a).ne[3], 1);
    let out = sys::ggml_mul_mat(ctx, a, b);
    sys::ggml_reshape_4d(ctx, out, (*cols).ne[1], (*cols).ne[2], (*data).ne[2], (*data).ne[3])
}

/// Relative-position multi-head self-attention with NeMo's untied biases.
///
/// `x` is `[d_model, T, B]`, `pos` is `[d_model, 2*T-1]` (the caller builds it
/// over the CONCATENATED sequence; see [`crate::sf_transformer::rel_pos_table`]).
/// Attention is full — Sortformer never restricts context, the AOSC cache
/// takes the place of a sliding window (`model.cpp:487-489` sets
/// `att_context_left/right = -1`).
///
/// Numerics (`conformer.cpp:503-520`): `scale = 1/sqrt(head_dim)`;
/// `matrix_bd = rel_shift(q_v @ p^T)` is pre-scaled and handed to
/// `flash_attn_ext` as the additive mask so the kernel computes
/// `softmax((q_u @ k^T + matrix_bd) * scale) @ v`.
pub(crate) unsafe fn rel_pos_attention(
    ctx: Context,
    x: Tensor,
    pos: Tensor,
    b: &ConformerBlockView,
    d_model: i64,
    heads: i64,
    flash: bool,
) -> Tensor {
    let time = (*x).ne[1];
    let batch = (*x).ne[2];
    let pos_len = (*pos).ne[1];
    let head = d_model / heads;
    let scale = 1.0 / (head as f32).sqrt();

    let mut q = linear(ctx, b.attn_q_w, x, b.attn_q_b);
    let mut k = linear(ctx, b.attn_k_w, x, b.attn_k_b);
    let mut v = linear(ctx, b.attn_v_w, x, b.attn_v_b);
    // linear_pos is bias-free in NeMo; the GGUF carries no tensor for it.
    let mut p = sys::ggml_mul_mat(ctx, b.attn_pos_w, pos);

    // Split heads to [head_dim, n_head, T, B]. pos_bias_u/v are [head_dim,
    // n_head] and must broadcast onto this BEFORE the permute moves T past
    // n_head — that is what makes the biases "untied" per head.
    q = sys::ggml_reshape_4d(ctx, q, head, heads, time, batch);
    let mut qu = sys::ggml_add(ctx, q, b.attn_pos_u);
    let mut qv = sys::ggml_add(ctx, q, b.attn_pos_v);
    qu = sys::ggml_permute(ctx, qu, 0, 2, 1, 3);
    qv = sys::ggml_cont(ctx, sys::ggml_permute(ctx, qv, 0, 2, 1, 3));
    k = sys::ggml_permute(ctx, sys::ggml_reshape_4d(ctx, k, head, heads, time, batch), 0, 2, 1, 3);
    v = sys::ggml_permute(ctx, sys::ggml_reshape_4d(ctx, v, head, heads, time, batch), 0, 2, 1, 3);
    // The position scores carry no batch axis; ne[3] stays 1 and broadcasts.
    p = sys::ggml_cont(
        ctx,
        sys::ggml_permute(ctx, sys::ggml_reshape_4d(ctx, p, head, heads, pos_len, 1), 0, 2, 1, 3),
    );

    let mut relative = rel_shift(ctx, sys::ggml_mul_mat(ctx, p, qv));
    // Keep the first T columns: rel_shift injects one dead column past T_kv.
    relative = sys::ggml_view_4d(
        ctx,
        relative,
        time,
        time,
        heads,
        batch,
        (*relative).nb[1],
        (*relative).nb[2],
        (*relative).nb[3],
        0,
    );

    let output = if flash {
        let mask = sys::ggml_cast(
            ctx,
            sys::ggml_scale(ctx, sys::ggml_cont(ctx, relative), scale),
            sys::ggml_type_GGML_TYPE_F16,
        );
        // K/V stay F32: the C++ stream graph pins kv_type to F32
        // (model.cpp:481) rather than the F16 parakeet uses, and the diarizer
        // is small enough that the bandwidth saving is not worth the drift.
        sys::ggml_flash_attn_ext(ctx, qu, k, v, mask, scale, 0.0, 0.0)
    } else {
        // Manual path, bit-comparable on CPU: scores = q_u @ k^T, add the
        // relative bias, then soft_max_ext fuses the 1/sqrt(d_k) scale.
        let kq = sys::ggml_mul_mat(ctx, k, qu);
        let kq = sys::ggml_add(ctx, kq, relative);
        let kq = sys::ggml_soft_max_ext(ctx, kq, std::ptr::null_mut(), scale, 0.0);
        let vt = sys::ggml_cont(ctx, sys::ggml_permute(ctx, v, 1, 0, 2, 3));
        let o = sys::ggml_mul_mat(ctx, vt, kq);
        sys::ggml_cont(ctx, sys::ggml_permute(ctx, o, 0, 2, 1, 3))
    };
    let output = sys::ggml_reshape_3d(ctx, output, d_model, time, batch);
    linear(ctx, b.attn_out_w, output, b.attn_out_b)
}

/// Conformer convolution module: pointwise -> GLU -> depthwise (symmetric
/// `(k-1)/2` padding) -> fused BatchNorm -> SiLU -> pointwise.
///
/// The BatchNorm is the load-time-fused `scale`/`bias` pair
/// ([`crate::sf_weights::fuse_batch_norm`]), not the raw running stats:
/// `y = x * scale + bias` with `scale = gamma / sqrt(var + eps)` and
/// `bias = beta - mean * scale` (`model.cpp:249-252`).
pub(crate) unsafe fn conv_module(
    ctx: Context,
    x: Tensor,
    b: &ConformerBlockView,
    d_model: i64,
    kernel: i64,
    promote_pointwise: bool,
) -> Tensor {
    let time = (*x).ne[1];
    let batch = (*x).ne[2];
    // Some backends refuse F16 weights in these mul_mats; parakeet-rs promotes
    // them on the CPU path and so do we.
    let pw1_w = if promote_pointwise {
        sys::ggml_cast(ctx, b.conv_pw1_w, sys::ggml_type_GGML_TYPE_F32)
    } else {
        b.conv_pw1_w
    };
    let pw2_w = if promote_pointwise {
        sys::ggml_cast(ctx, b.conv_pw2_w, sys::ggml_type_GGML_TYPE_F32)
    } else {
        b.conv_pw2_w
    };

    // Pointwise conv 1 as a direct mul_mat: kernel ne = [1, d_model, 2*d_model].
    let pw1 = sys::ggml_reshape_2d(ctx, pw1_w, d_model, 2 * d_model);
    let mut y = sys::ggml_mul_mat(ctx, pw1, x);
    if !b.conv_pw1_b.is_null() {
        y = sys::ggml_add(ctx, y, b.conv_pw1_b);
    }

    // GLU over ne[0]: gate * sigmoid(value).
    let gate = sys::ggml_view_3d(ctx, y, d_model, time, batch, (*y).nb[1], (*y).nb[2], 0);
    let value = sys::ggml_view_3d(
        ctx,
        y,
        d_model,
        time,
        batch,
        (*y).nb[1],
        (*y).nb[2],
        d_model as usize * sys::ggml_element_size(y),
    );
    y = sys::ggml_mul(ctx, gate, sigmoid(ctx, value));

    // Depthwise conv over time: [d_model, T, B] -> [T, d_model, B].
    y = sys::ggml_cont(ctx, sys::ggml_permute(ctx, y, 1, 0, 2, 3));
    let pad = (kernel - 1) / 2;
    let left = sys::ggml_fill(ctx, sys::ggml_new_tensor_4d(ctx, (*y).type_, pad, d_model, batch, 1), 0.0);
    let right = sys::ggml_fill(ctx, sys::ggml_new_tensor_4d(ctx, (*y).type_, pad, d_model, batch, 1), 0.0);
    y = sys::ggml_concat(ctx, sys::ggml_concat(ctx, left, y, 0), right, 0);
    let kernel4 = sys::ggml_reshape_4d(ctx, b.conv_dw_w, kernel, 1, 1, d_model);
    let data4 = sys::ggml_reshape_4d(ctx, y, (*y).ne[0], 1, d_model, batch);
    y = conv_2d_depthwise(ctx, kernel4, data4, 1, 1, 0, 0);
    y = sys::ggml_reshape_3d(ctx, y, (*y).ne[0], d_model, batch);
    // Back to [d_model, T, B]; the depthwise bias and the fused BN params are
    // 1-D [d_model] and broadcast over ne[0] in this layout.
    y = sys::ggml_cont(ctx, sys::ggml_permute(ctx, y, 1, 0, 2, 3));
    if !b.conv_dw_b.is_null() {
        y = sys::ggml_add(ctx, y, b.conv_dw_b);
    }

    y = sys::ggml_add(ctx, sys::ggml_mul(ctx, y, b.conv_bn_fused_scale), b.conv_bn_fused_bias);
    y = sys::ggml_silu(ctx, y);

    let pw2 = sys::ggml_reshape_2d(ctx, pw2_w, d_model, d_model);
    let mut out = sys::ggml_mul_mat(ctx, pw2, y);
    if !b.conv_pw2_b.is_null() {
        out = sys::ggml_add(ctx, out, b.conv_pw2_b);
    }
    out
}

/// One NEST FastConformer block: macaron FF1 -> rel-pos MHSA -> conv module ->
/// macaron FF2 -> per-block LayerNorm (`conformer.cpp:build_conformer_block`).
pub(crate) unsafe fn conformer_block(
    ctx: Context,
    mut x: Tensor,
    pos: Tensor,
    b: &ConformerBlockView,
    d_model: i64,
    heads: i64,
    conv_kernel: i64,
    flash: bool,
    promote_pointwise: bool,
) -> Tensor {
    x = macaron(
        ctx,
        x,
        b.norm_ff1_w,
        b.norm_ff1_b,
        b.ff1_lin1_w,
        b.ff1_lin1_b,
        b.ff1_lin2_w,
        b.ff1_lin2_b,
    );
    let norm = layer_norm(ctx, x, b.norm_attn_w, b.norm_attn_b);
    let attn = rel_pos_attention(ctx, norm, pos, b, d_model, heads, flash);
    x = sys::ggml_add(ctx, x, attn);
    let norm = layer_norm(ctx, x, b.norm_conv_w, b.norm_conv_b);
    let conv = conv_module(ctx, norm, b, d_model, conv_kernel, promote_pointwise);
    x = sys::ggml_add(ctx, x, conv);
    x = macaron(
        ctx,
        x,
        b.norm_ff2_w,
        b.norm_ff2_b,
        b.ff2_lin1_w,
        b.ff2_lin1_b,
        b.ff2_lin2_w,
        b.ff2_lin2_b,
    );
    layer_norm(ctx, x, b.norm_out_w, b.norm_out_b)
}
