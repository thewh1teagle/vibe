use crate::model::Model;
use crate::ops::{add_conv_bias, attention, conv_2d_depthwise, conv_module, layer_norm, macaron, Context, Tensor};
use crate::sys;

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

unsafe fn weight(model: &Model, name: &str) -> Tensor {
    model.tensor(name).expect("validated tensor catalog")
}

pub(crate) unsafe fn build_pre_encode(ctx: Context, model: &Model, mel: Tensor) -> Tensor {
    let mut x = sys::ggml_cont(ctx, sys::ggml_permute(ctx, mel, 1, 0, 2, 3));
    x = symmetric_pad(ctx, x);
    x = sys::ggml_conv_2d(ctx, weight(model, "enc.pre_encode.conv.0.weight"), x, 2, 2, 0, 0, 1, 1);
    x = sys::ggml_relu(ctx, add_conv_bias(ctx, x, weight(model, "enc.pre_encode.conv.0.bias")));

    x = symmetric_pad(ctx, x);
    x = conv_2d_depthwise(ctx, weight(model, "enc.pre_encode.conv.2.weight"), x, 2, 2, 0, 0);
    x = add_conv_bias(ctx, x, weight(model, "enc.pre_encode.conv.2.bias"));
    x = sys::ggml_conv_2d(ctx, weight(model, "enc.pre_encode.conv.3.weight"), x, 1, 1, 0, 0, 1, 1);
    x = sys::ggml_relu(ctx, add_conv_bias(ctx, x, weight(model, "enc.pre_encode.conv.3.bias")));

    x = symmetric_pad(ctx, x);
    x = conv_2d_depthwise(ctx, weight(model, "enc.pre_encode.conv.5.weight"), x, 2, 2, 0, 0);
    x = add_conv_bias(ctx, x, weight(model, "enc.pre_encode.conv.5.bias"));
    x = sys::ggml_conv_2d(ctx, weight(model, "enc.pre_encode.conv.6.weight"), x, 1, 1, 0, 0, 1, 1);
    x = sys::ggml_relu(ctx, add_conv_bias(ctx, x, weight(model, "enc.pre_encode.conv.6.bias")));

    let freq = (*x).ne[0];
    let time = (*x).ne[1];
    let channels = (*x).ne[2];
    let batch = (*x).ne[3];
    x = sys::ggml_cont(ctx, sys::ggml_permute(ctx, x, 0, 2, 1, 3));
    x = sys::ggml_reshape_3d(ctx, x, freq * channels, time, batch);
    x = sys::ggml_mul_mat(ctx, weight(model, "enc.pre_encode.out.weight"), x);
    let bias = weight(model, "enc.pre_encode.out.bias");
    let bias = sys::ggml_reshape_4d(ctx, bias, (*bias).ne[0], 1, 1, 1);
    sys::ggml_add(ctx, x, bias)
}

unsafe fn block(
    ctx: Context,
    model: &Model,
    mut x: Tensor,
    pos: Tensor,
    mask: Tensor,
    layer: i32,
    promote_pointwise: bool,
) -> Tensor {
    let n = |suffix: &str| format!("enc.blocks.{layer}.{suffix}");
    let w = |suffix: &str| weight(model, &n(suffix));
    let null = std::ptr::null_mut();
    x = macaron(
        ctx,
        x,
        w("norm_ff1.weight"),
        w("norm_ff1.bias"),
        w("ff1.linear1.weight"),
        null,
        w("ff1.linear2.weight"),
        null,
    );
    let norm = layer_norm(ctx, x, w("norm_attn.weight"), w("norm_attn.bias"));
    let attn = attention(
        ctx,
        norm,
        pos,
        mask,
        w("attn.linear_q.weight"),
        w("attn.linear_k.weight"),
        w("attn.linear_v.weight"),
        w("attn.linear_out.weight"),
        w("attn.linear_pos.weight"),
        w("attn.pos_bias_u"),
        w("attn.pos_bias_v"),
        model.info().encoder_dimension as i64,
        model.info().encoder_heads as i64,
    );
    x = sys::ggml_add(ctx, x, attn);
    let norm = layer_norm(ctx, x, w("norm_conv.weight"), w("norm_conv.bias"));
    let conv = conv_module(
        ctx,
        norm,
        w("conv.pointwise1.weight"),
        w("conv.depthwise.weight"),
        w("conv.bn.weight"),
        w("conv.bn.bias"),
        w("conv.bn.running_mean"),
        w("conv.bn.running_var"),
        w("conv.pointwise2.weight"),
        model.info().encoder_dimension as i64,
        model.info().encoder_conv_kernel as i64,
        promote_pointwise,
    );
    x = sys::ggml_add(ctx, x, conv);
    x = macaron(
        ctx,
        x,
        w("norm_ff2.weight"),
        w("norm_ff2.bias"),
        w("ff2.linear1.weight"),
        null,
        w("ff2.linear2.weight"),
        null,
    );
    layer_norm(ctx, x, w("norm_out.weight"), w("norm_out.bias"))
}

pub(crate) struct EncoderBuild {
    pub output: Tensor,
    pub position: Tensor,
    pub mask: Tensor,
}

pub(crate) unsafe fn build_encoder(ctx: Context, model: &Model, mel: Tensor, promote_pointwise: bool) -> EncoderBuild {
    let mut x = build_pre_encode(ctx, model, mel);
    if model.info().encoder_xscaling {
        x = sys::ggml_scale(ctx, x, (model.info().encoder_dimension as f32).sqrt());
    }
    let time = (*x).ne[1];
    let dimension = model.info().encoder_dimension as i64;
    let position = sys::ggml_new_tensor_2d(ctx, sys::ggml_type_GGML_TYPE_F32, dimension, 2 * time - 1);
    let mask = sys::ggml_new_tensor_4d(ctx, sys::ggml_type_GGML_TYPE_F32, time, time, 1, 1);
    for layer in 0..model.info().encoder_layers {
        eprintln!(
            "[parakeet][graph] build_encoder_layer={}/{}",
            layer + 1,
            model.info().encoder_layers
        );
        x = block(ctx, model, x, position, mask, layer, promote_pointwise);
    }
    EncoderBuild {
        output: x,
        position,
        mask,
    }
}

pub(crate) fn positional_embedding(dimension: usize, time: usize) -> Vec<f32> {
    let length = 2 * time - 1;
    let zero = (length - 1) / 2;
    let mut result = vec![0.0; length * dimension];
    for i in 0..length {
        let position = (zero as isize - i as isize) as f32;
        for k in 0..dimension / 2 {
            let div = ((2 * k) as f32 * (-10000.0f32.ln() / dimension as f32)).exp();
            result[i * dimension + 2 * k] = (position * div).sin();
            result[i * dimension + 2 * k + 1] = (position * div).cos();
        }
    }
    result
}

pub(crate) fn full_mask(time: usize) -> Vec<f32> {
    vec![0.0; time * time]
}
