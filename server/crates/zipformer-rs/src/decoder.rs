//! The stateless predictor and the joiner, evaluated directly on f32 weights:
//! one joiner step is a 1493 x 512 product, too small to be worth a graph.

use rayon::prelude::*;

use crate::load::Weights;
use crate::{Error, Result};

fn shape_error(name: &str, shape: &[usize], expected: &str) -> Error {
    Error::Load(format!("tensor {name} has shape {shape:?}, expected {expected}"))
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    const LANES: usize = 8;
    let (a_chunks, a_tail) = a.as_chunks::<LANES>();
    let (b_chunks, b_tail) = b.as_chunks::<LANES>();
    let mut sums = [0.0f32; LANES];
    for (x, y) in a_chunks.iter().zip(b_chunks) {
        for lane in 0..LANES {
            sums[lane] += x[lane] * y[lane];
        }
    }
    sums.iter().sum::<f32>() + a_tail.iter().zip(b_tail).map(|(x, y)| x * y).sum::<f32>()
}

/// `y = W x + b` with `W` stored `[outputs][inputs]`.
pub(crate) struct Linear {
    inputs: usize,
    outputs: usize,
    weight: Vec<f32>,
    bias: Vec<f32>,
}

impl Linear {
    fn load(weights: &Weights, name: &str) -> Result<Self> {
        let weight_name = format!("{name}.weight");
        let (shape, weight) = weights.f32(&weight_name)?;
        let &[outputs, inputs] = shape.as_slice() else {
            return Err(shape_error(&weight_name, &shape, "[outputs, inputs]"));
        };
        let bias_name = format!("{name}.bias");
        let (bias_shape, bias) = weights.f32(&bias_name)?;
        if bias.len() != outputs {
            return Err(shape_error(&bias_name, &bias_shape, &format!("[{outputs}]")));
        }
        Self::new(inputs, outputs, weight, bias).ok_or_else(|| shape_error(&weight_name, &shape, "a full matrix"))
    }

    pub(crate) fn new(inputs: usize, outputs: usize, weight: Vec<f32>, bias: Vec<f32>) -> Option<Self> {
        (inputs > 0 && weight.len() == inputs * outputs && bias.len() == outputs).then_some(Self {
            inputs,
            outputs,
            weight,
            bias,
        })
    }

    fn apply(&self, input: &[f32], output: &mut [f32]) {
        debug_assert_eq!(input.len(), self.inputs);
        debug_assert_eq!(output.len(), self.outputs);
        for ((out, row), bias) in output.iter_mut().zip(self.weight.chunks_exact(self.inputs)).zip(&self.bias) {
            *out = dot(row, input) + bias;
        }
    }
}

/// Embeds the last `context` tokens and mixes them with a grouped, bias-free
/// Conv1d whose kernel spans the whole context, followed by ReLU.
pub(crate) struct Decoder {
    dim: usize,
    context: usize,
    group_inputs: usize,
    embedding: Vec<f32>,
    conv: Vec<f32>,
}

impl Decoder {
    pub(crate) fn load(weights: &Weights) -> Result<Self> {
        let (embedding_shape, embedding) = weights.f32("decoder.embedding.weight")?;
        let &[_vocab, dim] = embedding_shape.as_slice() else {
            return Err(shape_error("decoder.embedding.weight", &embedding_shape, "[vocab, dim]"));
        };
        let (conv_shape, conv) = weights.f32("decoder.conv.weight")?;
        let groups = weights.meta_u32("stt.zipformer.decoder.conv_groups")? as usize;
        let &[outputs, group_inputs, context] = conv_shape.as_slice() else {
            return Err(shape_error(
                "decoder.conv.weight",
                &conv_shape,
                "[dim, dim / groups, context]",
            ));
        };
        if groups == 0 || outputs != dim || group_inputs * groups != dim {
            return Err(shape_error(
                "decoder.conv.weight",
                &conv_shape,
                &format!("[{dim}, {dim} / {groups}, context]"),
            ));
        }
        Self::new(dim, context, groups, embedding, conv)
            .ok_or_else(|| shape_error("decoder.conv.weight", &conv_shape, "a full kernel"))
    }

    pub(crate) fn new(dim: usize, context: usize, groups: usize, embedding: Vec<f32>, conv: Vec<f32>) -> Option<Self> {
        if dim == 0 || context == 0 || groups == 0 || !dim.is_multiple_of(groups) || !embedding.len().is_multiple_of(dim) {
            return None;
        }
        let group_inputs = dim / groups;
        (conv.len() == dim * group_inputs * context).then_some(Self {
            dim,
            context,
            group_inputs,
            embedding,
            conv,
        })
    }

    pub(crate) fn dim(&self) -> usize {
        self.dim
    }

    pub(crate) fn context_size(&self) -> usize {
        self.context
    }

    pub(crate) fn vocab(&self) -> usize {
        self.embedding.len() / self.dim
    }

    /// `context` holds the last `context_size` token ids, oldest first; `None`
    /// is the position before the start and embeds to zeros.
    pub(crate) fn forward(&self, context: &[Option<u32>]) -> Vec<f32> {
        debug_assert_eq!(context.len(), self.context);
        let embeddings = context
            .iter()
            .map(|id| id.map(|id| &self.embedding[id as usize * self.dim..(id as usize + 1) * self.dim]))
            .collect::<Vec<_>>();
        let kernel = self.group_inputs * self.context;
        self.conv
            .chunks_exact(kernel)
            .enumerate()
            .map(|(output, weights)| {
                let first = (output / self.group_inputs) * self.group_inputs;
                let mut sum = 0.0f32;
                for (input, taps) in weights.chunks_exact(self.context).enumerate() {
                    for (tap, embedding) in taps.iter().zip(&embeddings) {
                        if let Some(embedding) = embedding {
                            sum += tap * embedding[first + input];
                        }
                    }
                }
                sum.max(0.0)
            })
            .collect()
    }
}

/// `logits = output(tanh(encoder_proj(enc) + decoder_proj(dec)))`. The two
/// projections are exposed separately so the encoder side runs once per chunk
/// and the decoder side once per emitted token.
pub(crate) struct Joiner {
    encoder_proj: Linear,
    decoder_proj: Linear,
    output: Linear,
}

impl Joiner {
    pub(crate) fn load(weights: &Weights) -> Result<Self> {
        let activation = weights.meta_str("stt.zipformer.joiner.activation")?;
        if activation != "tanh" {
            return Err(Error::InvalidMetadata {
                key: "stt.zipformer.joiner.activation",
                message: format!("unsupported activation {activation:?}"),
            });
        }
        Self::new(
            Linear::load(weights, "joiner.encoder_proj")?,
            Linear::load(weights, "joiner.decoder_proj")?,
            Linear::load(weights, "joiner.output_linear")?,
        )
        .ok_or_else(|| Error::Load("joiner projections disagree on the hidden size".into()))
    }

    pub(crate) fn new(encoder_proj: Linear, decoder_proj: Linear, output: Linear) -> Option<Self> {
        (encoder_proj.outputs == output.inputs && decoder_proj.outputs == output.inputs).then_some(Self {
            encoder_proj,
            decoder_proj,
            output,
        })
    }

    pub(crate) fn encoder_dim(&self) -> usize {
        self.encoder_proj.inputs
    }

    pub(crate) fn decoder_dim(&self) -> usize {
        self.decoder_proj.inputs
    }

    pub(crate) fn hidden(&self) -> usize {
        self.output.inputs
    }

    pub(crate) fn vocab(&self) -> usize {
        self.output.outputs
    }

    /// Projects every encoder frame; `encoder` is row-major `[frames][encoder_dim]`.
    pub(crate) fn project_encoder(&self, encoder: &[f32]) -> Vec<f32> {
        let frames = encoder.len() / self.encoder_proj.inputs;
        let mut projected = vec![0.0f32; frames * self.hidden()];
        projected
            .par_chunks_mut(self.hidden())
            .zip(encoder.par_chunks(self.encoder_proj.inputs))
            .for_each(|(output, input)| self.encoder_proj.apply(input, output));
        projected
    }

    pub(crate) fn project_decoder(&self, decoder: &[f32]) -> Vec<f32> {
        let mut projected = vec![0.0f32; self.hidden()];
        self.decoder_proj.apply(decoder, &mut projected);
        projected
    }

    pub(crate) fn logits(&self, encoder: &[f32], decoder: &[f32], hidden: &mut [f32], logits: &mut [f32]) {
        for ((hidden, encoder), decoder) in hidden.iter_mut().zip(encoder).zip(decoder) {
            *hidden = (encoder + decoder).tanh();
        }
        self.output.apply(hidden, logits);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dot_handles_lengths_off_the_lane_width() {
        let a = (0..19).map(|n| n as f32).collect::<Vec<_>>();
        let b = vec![2.0f32; 19];
        assert_eq!(dot(&a, &b), 342.0);
    }

    #[test]
    fn linear_is_row_major_outputs_by_inputs() {
        let linear = Linear::new(2, 3, vec![1.0, 0.0, 0.0, 1.0, 1.0, 1.0], vec![0.5, 0.0, -1.0]).unwrap();
        let mut output = [0.0; 3];
        linear.apply(&[2.0, 3.0], &mut output);
        assert_eq!(output, [2.5, 3.0, 4.0]);
        assert!(Linear::new(2, 3, vec![0.0; 5], vec![0.0; 3]).is_none());
    }

    /// dim 4 in 2 groups of 2, context 2, vocab 3: output `o` reads inputs
    /// `2 * (o / 2) + {0, 1}` of both context embeddings.
    fn toy_decoder() -> Decoder {
        let embedding = vec![1.0, 2.0, 3.0, 4.0, -1.0, -2.0, -3.0, -4.0, 0.5, 0.5, 0.5, 0.5];
        let conv = vec![
            1.0, 0.0, 0.0, 0.0, // o0: older[0]
            0.0, 1.0, 0.0, 1.0, // o1: newer[0] + newer[1]
            0.0, 0.0, 1.0, 0.0, // o2: older[3]
            -1.0, 0.0, 0.0, 0.0, // o3: -older[2]
        ];
        Decoder::new(4, 2, 2, embedding, conv).unwrap()
    }

    #[test]
    fn decoder_is_a_grouped_convolution_over_the_context_with_relu() {
        let decoder = toy_decoder();
        assert_eq!((decoder.dim(), decoder.context_size(), decoder.vocab()), (4, 2, 3));
        assert_eq!(decoder.forward(&[Some(0), Some(2)]), [1.0, 1.0, 4.0, 0.0]);
        assert_eq!(decoder.forward(&[Some(1), Some(0)]), [0.0, 3.0, 0.0, 3.0]);
    }

    #[test]
    fn missing_context_embeds_to_zeros_not_to_blank() {
        let decoder = toy_decoder();
        assert_eq!(decoder.forward(&[None, Some(0)]), [0.0, 3.0, 0.0, 0.0]);
        assert_eq!(decoder.forward(&[None, None]), [0.0; 4]);
    }

    #[test]
    fn joiner_adds_projections_before_tanh() {
        let identity = |bias: f32| Linear::new(2, 2, vec![1.0, 0.0, 0.0, 1.0], vec![bias; 2]).unwrap();
        let output = Linear::new(2, 3, vec![1.0, 0.0, 0.0, 1.0, 1.0, 1.0], vec![0.0, 0.0, 1.0]).unwrap();
        let joiner = Joiner::new(identity(0.0), identity(1.0), output).unwrap();
        assert_eq!(
            (joiner.encoder_dim(), joiner.decoder_dim(), joiner.hidden(), joiner.vocab()),
            (2, 2, 2, 3)
        );
        let encoder = joiner.project_encoder(&[0.5, -1.0, 0.0, 0.0]);
        assert_eq!(encoder, [0.5, -1.0, 0.0, 0.0]);
        let decoder = joiner.project_decoder(&[-0.5, 0.0]);
        assert_eq!(decoder, [0.5, 1.0]);
        let (mut hidden, mut logits) = ([0.0; 2], [0.0; 3]);
        joiner.logits(&encoder[..2], &decoder, &mut hidden, &mut logits);
        let expected = [1.0f32.tanh(), 0.0, 1.0f32.tanh() + 1.0];
        assert!(logits.iter().zip(expected).all(|(a, b)| (a - b).abs() < 1e-6));
    }
}
