//! Unsafe graph-building primitives for the Zipformer2 port.
//!
//! Sequences are GGML tensors `[channels, time]`, which is the spec's
//! row-major `[time, channels]`. `mul_mat(a, b)` contracts the first
//! dimension of both and returns `[a.ne[1], b.ne[1], ..]`.

use crate::load::{DeviceWeights, Weights};
use crate::{sys, Result};

pub(crate) type Tensor = *mut sys::ggml_tensor;
pub(crate) type Context = *mut sys::ggml_context;
/// Host-computed tensors and the values to upload into them before a run.
pub(crate) type Inputs = Vec<(Tensor, Vec<f32>)>;

const F32: sys::ggml_type = sys::ggml_type_GGML_TYPE_F32;
const F32_BYTES: usize = std::mem::size_of::<f32>();

/// Builds one graph: resolves weights on the backend that will run it and
/// collects the host-computed tensors to upload before the run.
pub(crate) struct Builder<'a> {
    pub ctx: Context,
    weights: &'a Weights,
    device: Option<&'a DeviceWeights>,
    pub inputs: Inputs,
}

impl<'a> Builder<'a> {
    pub(crate) fn new(ctx: Context, weights: &'a Weights, device: Option<&'a DeviceWeights>) -> Self {
        Self {
            ctx,
            weights,
            device,
            inputs: Vec::new(),
        }
    }

    pub(crate) fn weight(&self, name: &str) -> Result<Tensor> {
        match self.device {
            Some(device) => device.tensor(name),
            None => self.weights.tensor(name),
        }
    }

    /// Host copy of a tensor, for values folded into constants at build time.
    pub(crate) fn host(&self, name: &str) -> Result<Vec<f32>> {
        Ok(self.weights.f32(name)?.1)
    }

    /// A tensor filled from the host before the graph runs. `data` is in GGML
    /// order, first dimension fastest.
    pub(crate) unsafe fn input(&mut self, ne: &[i64], data: Vec<f32>) -> Tensor {
        debug_assert_eq!(ne.iter().product::<i64>() as usize, data.len());
        let tensor = sys::ggml_new_tensor(self.ctx, F32, ne.len() as i32, ne.as_ptr());
        self.inputs.push((tensor, data));
        tensor
    }

    /// `x @ W.T + b` over the first dimension of `x`.
    pub(crate) unsafe fn linear(&self, name: &str, x: Tensor) -> Result<Tensor> {
        let y = sys::ggml_mul_mat(self.ctx, self.weight(&format!("{name}.weight"))?, x);
        Ok(sys::ggml_add(self.ctx, y, self.weight(&format!("{name}.bias"))?))
    }

    /// `x * mean_c((x - bias)^2)^-0.5 * exp(log_scale)`: the bias only shapes the scale.
    pub(crate) unsafe fn bias_norm(&self, name: &str, x: Tensor) -> Result<Tensor> {
        let ctx = self.ctx;
        let gain = self.host(&format!("{name}.log_scale"))?[0].exp();
        let centered = sys::ggml_sub(ctx, x, self.weight(&format!("{name}.bias"))?);
        let power = sys::ggml_mean(ctx, sys::ggml_sqr(ctx, centered));
        let y = sys::ggml_div(ctx, x, sys::ggml_sqrt(ctx, power));
        Ok(sys::ggml_scale(ctx, y, gain))
    }

    /// `a + (b - a) * bypass_scale`, per channel.
    pub(crate) unsafe fn bypass(&self, name: &str, a: Tensor, b: Tensor) -> Result<Tensor> {
        let ctx = self.ctx;
        let scale = self.weight(&format!("{name}.bypass_scale"))?;
        Ok(sys::ggml_add(ctx, a, sys::ggml_mul(ctx, sys::ggml_sub(ctx, b, a), scale)))
    }

    /// Weighted sum of every `factor` consecutive frames with `softmax(bias)`,
    /// the last frame repeated to fill the final group.
    pub(crate) unsafe fn downsample(&mut self, bias: &str, x: Tensor, factor: i64) -> Result<Tensor> {
        let ctx = self.ctx;
        let bias = self.host(bias)?;
        let peak = bias.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let total = bias.iter().map(|value| (value - peak).exp()).sum::<f32>();
        let mix = bias.iter().map(|value| (value - peak).exp() / total).collect::<Vec<_>>();

        let (channels, time) = ((*x).ne[0], (*x).ne[1]);
        let out = (time + factor - 1) / factor;
        let missing = out * factor - time;
        let mut padded = x;
        if missing > 0 {
            let last = sys::ggml_view_2d(ctx, x, channels, 1, (*x).nb[1], (time - 1) as usize * (*x).nb[1]);
            padded = sys::ggml_concat(ctx, x, sys::ggml_repeat_4d(ctx, last, channels, missing, 1, 1), 1);
        }
        let groups = sys::ggml_reshape_3d(ctx, padded, channels, factor, out);
        let groups = sys::ggml_cont(ctx, sys::ggml_permute(ctx, groups, 1, 0, 2, 3));
        let mix = self.input(&[factor, 1], mix);
        Ok(sys::ggml_reshape_2d(ctx, sys::ggml_mul_mat(ctx, mix, groups), channels, out))
    }
}

/// `ln(1 + e^(x - 4)) - 0.08 x - 0.035`
pub(crate) unsafe fn swoosh_l(ctx: Context, x: Tensor) -> Tensor {
    swoosh(ctx, x, 4.0, 0.035)
}

/// `ln(1 + e^(x - 1)) - 0.08 x - 0.313261687`
pub(crate) unsafe fn swoosh_r(ctx: Context, x: Tensor) -> Tensor {
    swoosh(ctx, x, 1.0, 0.313_261_7)
}

unsafe fn swoosh(ctx: Context, x: Tensor, shift: f32, offset: f32) -> Tensor {
    let soft = sys::ggml_softplus(ctx, sys::ggml_scale_bias(ctx, x, 1.0, -shift));
    sys::ggml_add(ctx, soft, sys::ggml_scale_bias(ctx, x, -0.08, -offset))
}

/// Channels `start .. start + count` of a `[channels, time]` tensor, as a copy.
pub(crate) unsafe fn channels(ctx: Context, x: Tensor, start: i64, count: i64) -> Tensor {
    let view = sys::ggml_view_2d(ctx, x, count, (*x).ne[1], (*x).nb[1], start as usize * F32_BYTES);
    sys::ggml_cont(ctx, view)
}

/// Truncates or zero-pads the channel dimension to `count`.
pub(crate) unsafe fn resize_channels(ctx: Context, x: Tensor, count: i64) -> Tensor {
    let current = (*x).ne[0];
    match count.cmp(&current) {
        std::cmp::Ordering::Equal => x,
        std::cmp::Ordering::Less => channels(ctx, x, 0, count),
        std::cmp::Ordering::Greater => sys::ggml_pad(ctx, x, (count - current) as i32, 0, 0, 0),
    }
}

/// Repeats every frame `factor` times and keeps the first `time` frames.
pub(crate) unsafe fn upsample(ctx: Context, x: Tensor, factor: i64, time: i64) -> Tensor {
    let (width, frames) = ((*x).ne[0], (*x).ne[1]);
    let x = sys::ggml_reshape_3d(ctx, x, width, 1, frames);
    let x = sys::ggml_repeat_4d(ctx, x, width, factor, frames, 1);
    let x = sys::ggml_reshape_2d(ctx, x, width, factor * frames);
    sys::ggml_view_2d(ctx, x, width, time, (*x).nb[1], 0)
}

/// 2-D cross-correlation without bias. `x` is `[W, H, C, 1]`, `kernel` is
/// `[KW, KH, C, OC]`; the result is `[OC, OW * OH]`, channels first, with the
/// output width and height.
///
/// `ggml_conv_2d` builds its patches in half precision, which costs 1e-2 on
/// log-mel input, so the patches are built here in f32.
pub(crate) unsafe fn conv_2d(ctx: Context, kernel: Tensor, x: Tensor, stride: (i32, i32), pad: (i32, i32)) -> (Tensor, i64, i64) {
    let patches = sys::ggml_im2col(ctx, kernel, x, stride.0, stride.1, pad.0, pad.1, 1, 1, true, F32);
    let (width, height) = ((*patches).ne[1], (*patches).ne[2]);
    let patches = sys::ggml_reshape_2d(ctx, patches, (*patches).ne[0], width * height);
    let kernel = sys::ggml_reshape_2d(
        ctx,
        kernel,
        (*kernel).ne[0] * (*kernel).ne[1] * (*kernel).ne[2],
        (*kernel).ne[3],
    );
    (sys::ggml_mul_mat(ctx, kernel, patches), width, height)
}

/// Depthwise 1-D cross-correlation along the first dimension of `x`
/// (`[time, channels]`), zero-padded by `pad` on both sides. `kernel` is the
/// PyTorch Conv1d weight `[channels, 1, K]`, GGML `[K, 1, channels]`.
pub(crate) unsafe fn conv_1d_depthwise(ctx: Context, kernel: Tensor, x: Tensor, pad: i32) -> Tensor {
    let (time, width) = ((*x).ne[0], (*x).ne[1]);
    let kernel = sys::ggml_reshape_4d(ctx, kernel, (*kernel).ne[0], 1, 1, width);
    let x = sys::ggml_reshape_4d(ctx, x, time, 1, width, 1);
    let y = sys::ggml_conv_2d_dw_direct(ctx, kernel, x, 1, 1, pad, 0, 1, 1);
    sys::ggml_reshape_2d(ctx, y, (*y).ne[0], width)
}

/// Picks `shifted[j, i, h] = x[time - 1 + j - i, i, h]` out of the scores of
/// every target `i` against every relative position, `x` being
/// `[2 * time - 1, time, heads]`. Each row starts one element earlier than
/// the row before it, which is a strided view of the same memory.
pub(crate) unsafe fn relative_shift(ctx: Context, x: Tensor) -> Tensor {
    let (time, heads) = ((*x).ne[1], (*x).ne[2]);
    let view = sys::ggml_view_3d(
        ctx,
        x,
        time,
        time,
        heads,
        (2 * time - 2) as usize * F32_BYTES,
        (*x).nb[2],
        (time - 1) as usize * F32_BYTES,
    );
    sys::ggml_cont(ctx, view)
}
