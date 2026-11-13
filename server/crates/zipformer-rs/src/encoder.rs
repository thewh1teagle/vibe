//! The Zipformer2 encoder: padded fbank features in, 25 Hz frames out.
//!
//! One static graph per call, full context: no attention mask, and every
//! chunk-causal convolution sees the sequence as a single chunk.

use std::sync::Arc;

use crate::fbank::Features;
use crate::layer::{layer, LayerShape};
use crate::load::{DeviceWeights, Weights};
use crate::ops::{channels, conv_2d, resize_channels, swoosh_l, swoosh_r, upsample, Builder, Inputs, Tensor};
use crate::runtime::{Graph, Runtime};
use crate::{sys, Error, Result};

const EMBED_MIN_FRAMES: usize = 9;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct EncoderOutput {
    pub frames: usize,
    pub dim: usize,
    /// Row-major `[frames][dim]`.
    pub data: Vec<f32>,
}

/// Every stage the reference dumps record, for parity checks.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) struct EncoderStages {
    pub embed: EncoderOutput,
    pub stacks: Vec<EncoderOutput>,
    pub output: EncoderOutput,
}

struct Stack {
    layers: usize,
    downsample: i64,
    shape: LayerShape,
}

pub(crate) struct Encoder {
    weights: Arc<Weights>,
    device: Option<DeviceWeights>,
    runtime: Runtime,
    stacks: Vec<Stack>,
    pos_dim: usize,
    output_downsample: i64,
    bins: usize,
}

unsafe impl Send for Encoder {}

struct Built {
    features: Tensor,
    embed: Tensor,
    stacks: Vec<Tensor>,
    output: Tensor,
}

impl Encoder {
    /// With `use_gpu` the encoder weights are uploaded to the first GPU
    /// backend; without one, or without `use_gpu`, the encoder runs on the CPU.
    pub(crate) fn new(weights: Arc<Weights>, use_gpu: bool) -> Result<Self> {
        let stacks = read_stacks(&weights)?;
        let device = if use_gpu { weights.upload()? } else { None };
        let runtime = match &device {
            Some(device) => Runtime::borrowed(device.backend),
            None => Runtime::cpu()?,
        };
        Ok(Self {
            pos_dim: weights.meta_u32("stt.zipformer.encoder.pos_dim")? as usize,
            output_downsample: weights.meta_u32("stt.zipformer.encoder.output_downsampling_factor")? as i64,
            bins: weights.meta_u32("stt.frontend.num_mels")? as usize,
            weights,
            device,
            runtime,
            stacks,
        })
    }

    pub(crate) fn on_gpu(&self) -> bool {
        self.device.is_some()
    }

    pub(crate) fn forward(&mut self, features: &Features) -> Result<EncoderOutput> {
        Ok(self.run(features, false)?.output)
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn forward_stages(&mut self, features: &Features) -> Result<EncoderStages> {
        self.run(features, true)
    }

    fn run(&mut self, features: &Features, keep_stages: bool) -> Result<EncoderStages> {
        if features.bins != self.bins || features.data.len() != features.frames * features.bins {
            return Err(Error::Ggml("feature shape does not match the model"));
        }
        if features.frames < EMBED_MIN_FRAMES {
            return Err(Error::Ggml("too few feature frames for the encoder"));
        }
        unsafe {
            let (mut graph, built, mut inputs) = self.build(features, keep_stages)?;
            if !self.runtime.is_cpu() {
                let missing = self.runtime.unsupported(&graph);
                if !missing.is_empty() {
                    eprintln!("[zipformer][encoder] gpu backend lacks {missing:?}; running on the cpu");
                    self.runtime = Runtime::cpu()?;
                    self.device = None;
                    drop(graph);
                    return self.run(features, keep_stages);
                }
            }
            inputs.push((built.features, features.data.clone()));
            self.runtime.execute(&mut graph, &inputs)?;
            Ok(EncoderStages {
                embed: if keep_stages { read(built.embed) } else { empty() },
                stacks: built.stacks.iter().map(|&stack| read(stack)).collect(),
                output: read(built.output),
            })
        }
    }

    unsafe fn build(&self, features: &Features, keep_stages: bool) -> Result<(Graph, Built, Inputs)> {
        let mut graph = Graph::new()?;
        let mut b = Builder::new(graph.ctx, &self.weights, self.device.as_ref());
        let ctx = b.ctx;
        let input = sys::ggml_new_tensor_4d(
            ctx,
            sys::ggml_type_GGML_TYPE_F32,
            features.bins as i64,
            features.frames as i64,
            1,
            1,
        );
        let embed = embed(&mut b, input)?;
        let time = (*embed).ne[1];

        let mut x = embed;
        let mut outputs = Vec::with_capacity(self.stacks.len());
        for (index, stack) in self.stacks.iter().enumerate() {
            x = resize_channels(ctx, x, stack.shape.dim);
            let original = x;
            if stack.downsample > 1 {
                x = b.downsample(&format!("enc.{index}.downsample.bias"), x, stack.downsample)?;
            }
            let frames = (*x).ne[1];
            let positions = b.input(
                &[self.pos_dim as i64, 2 * frames - 1],
                positional_encoding(frames as usize, self.pos_dim),
            );
            for layer_index in 0..stack.layers {
                x = layer(&mut b, &format!("enc.{index}.{layer_index}"), x, positions, &stack.shape)?;
            }
            if stack.downsample > 1 {
                x = upsample(ctx, x, stack.downsample, time);
                x = b.bypass(&format!("enc.{index}.out_combiner"), original, x)?;
            }
            outputs.push(x);
        }

        let last = *outputs.last().ok_or(Error::Ggml("encoder has no stacks"))?;
        let mut combined = last;
        let mut width = (*last).ne[0];
        for &output in outputs.iter().rev().skip(1) {
            let wider = (*output).ne[0];
            if wider > width {
                combined = sys::ggml_concat(ctx, combined, channels(ctx, output, width, wider - width), 0);
                width = wider;
            }
        }
        let output = b.downsample("enc.downsample_output.bias", combined, self.output_downsample)?;

        if keep_stages {
            graph.output(embed);
            for &stack in &outputs {
                graph.output(stack);
            }
        }
        graph.output(output);
        let built = Built {
            features: input,
            embed,
            stacks: if keep_stages { outputs } else { Vec::new() },
            output,
        };
        Ok((graph, built, b.inputs))
    }
}

fn empty() -> EncoderOutput {
    EncoderOutput {
        frames: 0,
        dim: 0,
        data: Vec::new(),
    }
}

unsafe fn read(tensor: Tensor) -> EncoderOutput {
    EncoderOutput {
        frames: (*tensor).ne[1] as usize,
        dim: (*tensor).ne[0] as usize,
        data: Graph::read(tensor),
    }
}

fn read_stacks(weights: &Weights) -> Result<Vec<Stack>> {
    const COUNT: &str = "stt.zipformer.encoder.n_stacks";
    let count = weights.meta_u32(COUNT)? as usize;
    let list = |key: &'static str| -> Result<Vec<i64>> {
        let values = weights.meta_i32s(key)?;
        if values.len() != count || values.iter().any(|&value| value <= 0) {
            return Err(Error::InvalidMetadata {
                key,
                message: format!("expected {count} positive values, found {values:?}"),
            });
        }
        Ok(values.into_iter().map(i64::from).collect())
    };
    let layers = list("stt.zipformer.encoder.n_layers")?;
    let dim = list("stt.zipformer.encoder.dim")?;
    let downsample = list("stt.zipformer.encoder.downsampling_factor")?;
    let heads = list("stt.zipformer.encoder.n_heads")?;
    let kernel = list("stt.zipformer.encoder.cnn_module_kernel")?;
    let query_dim = list("stt.zipformer.encoder.query_head_dim")?;
    let value_dim = list("stt.zipformer.encoder.value_head_dim")?;
    let pos_dim = list("stt.zipformer.encoder.pos_head_dim")?;
    Ok((0..count)
        .map(|index| Stack {
            layers: layers[index] as usize,
            downsample: downsample[index],
            shape: LayerShape {
                dim: dim[index],
                heads: heads[index],
                query_dim: query_dim[index],
                value_dim: value_dim[index],
                pos_dim: pos_dim[index],
                kernel: kernel[index],
            },
        })
        .collect())
}

/// Conv2dSubsampling: `[bins, T, 1, 1]` features to `[192, (T - 7) / 2]`.
///
/// Activations are kept channels-first (`[C, W * H]`, W the frequency axis
/// and H time) so biases broadcast along rows; each convolution gets its
/// `[W, H, C]` input from one transposed copy.
unsafe fn embed(b: &mut Builder, features: Tensor) -> Result<Tensor> {
    let ctx = b.ctx;
    let mut x = features;
    let mut flat = features;
    let mut size = (0, 0);
    for (index, stride, pad) in [(0, (1, 1), (1, 0)), (4, (2, 2), (0, 0)), (7, (2, 1), (0, 0))] {
        let name = format!("embed.conv.{index}");
        let (y, width, height) = conv_2d(ctx, b.weight(&format!("{name}.weight"))?, x, stride, pad);
        flat = swoosh_r(ctx, sys::ggml_add(ctx, y, b.weight(&format!("{name}.bias"))?));
        size = (width, height);
        let planes = sys::ggml_cont(ctx, sys::ggml_transpose(ctx, flat));
        x = sys::ggml_reshape_4d(ctx, planes, width, height, (*flat).ne[0], 1);
    }
    let (width, height) = size;
    let filters = (*flat).ne[0];

    let next = "embed.convnext";
    let depthwise = sys::ggml_conv_2d_dw_direct(ctx, b.weight(&format!("{next}.depthwise_conv.weight"))?, x, 1, 1, 3, 3, 1, 1);
    let depthwise = sys::ggml_cont(ctx, sys::ggml_permute(ctx, depthwise, 1, 2, 0, 3));
    let depthwise = sys::ggml_reshape_2d(ctx, depthwise, filters, width * height);

    let expand = b.weight(&format!("{next}.pointwise_conv1.weight"))?;
    let hidden = (*expand).ne[3];
    let expand_bias = folded_bias(b, next, filters as usize)?;
    let expand_bias = b.input(&[hidden], expand_bias);
    let mut y = sys::ggml_mul_mat(ctx, sys::ggml_reshape_2d(ctx, expand, filters, hidden), depthwise);
    y = swoosh_l(ctx, sys::ggml_add(ctx, y, expand_bias));
    let project = b.weight(&format!("{next}.pointwise_conv2.weight"))?;
    y = sys::ggml_mul_mat(ctx, sys::ggml_reshape_2d(ctx, project, hidden, filters), y);
    y = sys::ggml_add(ctx, y, b.weight(&format!("{next}.pointwise_conv2.bias"))?);
    y = sys::ggml_add(ctx, y, flat);

    let y = sys::ggml_reshape_3d(ctx, y, filters, width, height);
    let y = sys::ggml_cont(ctx, sys::ggml_permute(ctx, y, 1, 0, 2, 3));
    let y = sys::ggml_reshape_2d(ctx, y, width * filters, height);
    b.bias_norm("embed.out_norm", b.linear("embed.out", y)?)
}

/// The depthwise bias carried through the first pointwise convolution:
/// `pointwise1(depthwise + b_dw) = pointwise1(depthwise) + (W1 b_dw + b1)`.
fn folded_bias(b: &Builder, next: &str, filters: usize) -> Result<Vec<f32>> {
    let depthwise = b.host(&format!("{next}.depthwise_conv.bias"))?;
    let weight = b.host(&format!("{next}.pointwise_conv1.weight"))?;
    let mut bias = b.host(&format!("{next}.pointwise_conv1.bias"))?;
    for (value, row) in bias.iter_mut().zip(weight.chunks_exact(filters)) {
        *value += row.iter().zip(&depthwise).map(|(w, d)| w * d).sum::<f32>();
    }
    Ok(bias)
}

/// `[2 * time - 1][dim]`, row `r` being relative position `r - (time - 1)`:
/// cosines and sines of a compressed position, the last column the constant 1.
fn positional_encoding(time: usize, dim: usize) -> Vec<f32> {
    let rows = 2 * time - 1;
    let compress = (dim as f64).sqrt();
    let mut table = vec![0.0f32; rows * dim];
    for (row, values) in table.chunks_exact_mut(dim).enumerate() {
        let position = row as f64 - (time as f64 - 1.0);
        let compressed = compress * position.signum() * ((position.abs() + compress).ln() - compress.ln());
        let angle = (compressed / (dim as f64 / (2.0 * std::f64::consts::PI))).atan();
        for pair in 0..dim / 2 {
            let phase = angle * (pair + 1) as f64;
            values[2 * pair] = phase.cos() as f32;
            values[2 * pair + 1] = phase.sin() as f32;
        }
        values[dim - 1] = 1.0;
    }
    table
}
