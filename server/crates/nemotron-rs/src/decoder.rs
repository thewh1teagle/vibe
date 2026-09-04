use crate::model::Model;
use crate::runtime::{CpuRuntime, Graph};
use crate::{sys, Error, Result};

#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub id: u32,
    pub frame: usize,
}

struct StepGraph {
    graph: Graph,
    embedding: *mut sys::ggml_tensor,
    encoder: *mut sys::ggml_tensor,
    prev_h: Vec<*mut sys::ggml_tensor>,
    prev_c: Vec<*mut sys::ggml_tensor>,
    next_h: Vec<*mut sys::ggml_tensor>,
    next_c: Vec<*mut sys::ggml_tensor>,
    logits: *mut sys::ggml_tensor,
}

struct EmbeddingGraph {
    graph: Graph,
    id: *mut sys::ggml_tensor,
    output: *mut sys::ggml_tensor,
}

impl EmbeddingGraph {
    unsafe fn new(model: &Model) -> Result<Self> {
        let mut graph = Graph::new()?;
        let id = sys::ggml_new_tensor_1d(graph.ctx, sys::ggml_type_GGML_TYPE_F32, 1);
        let id_i32 = sys::ggml_cast(graph.ctx, id, sys::ggml_type_GGML_TYPE_I32);
        let output = sys::ggml_get_rows(graph.ctx, model.cpu_tensor("pred.embed.weight").unwrap(), id_i32);
        graph.output(output);
        Ok(Self { graph, id, output })
    }

    unsafe fn lookup(&mut self, runtime: &CpuRuntime, token: u32, hidden: usize) -> Result<Vec<f32>> {
        runtime.execute(&mut self.graph, &[(self.id, &[token as f32])])?;
        let mut result = vec![0.0f32; hidden];
        sys::ggml_backend_tensor_get(self.output, result.as_mut_ptr().cast(), 0, result.len() * 4);
        Ok(result)
    }
}

impl StepGraph {
    unsafe fn new(model: &Model) -> Result<Self> {
        let mut graph = Graph::new()?;
        let hidden = model.info().predictor_hidden as i64;
        let layers = model.info().predictor_layers as usize;
        let embedding = sys::ggml_new_tensor_1d(graph.ctx, sys::ggml_type_GGML_TYPE_F32, hidden);
        let encoder = sys::ggml_new_tensor_1d(graph.ctx, sys::ggml_type_GGML_TYPE_F32, model.info().encoder_dimension as i64);
        let mut prev_h = Vec::new();
        let mut prev_c = Vec::new();
        let mut next_h = Vec::new();
        let mut next_c = Vec::new();
        let mut input = embedding;
        for layer in 0..layers {
            let h = sys::ggml_new_tensor_1d(graph.ctx, sys::ggml_type_GGML_TYPE_F32, hidden);
            let c = sys::ggml_new_tensor_1d(graph.ctx, sys::ggml_type_GGML_TYPE_F32, hidden);
            prev_h.push(h);
            prev_c.push(c);
            let wx = model.cpu_tensor(&format!("pred.lstm.{layer}.Wx")).unwrap();
            let wh = model.cpu_tensor(&format!("pred.lstm.{layer}.Wh")).unwrap();
            let bias = model.cpu_tensor(&format!("pred.lstm.{layer}.bias")).unwrap();
            let gates = sys::ggml_add(
                graph.ctx,
                sys::ggml_add(
                    graph.ctx,
                    sys::ggml_mul_mat(graph.ctx, wx, input),
                    sys::ggml_mul_mat(graph.ctx, wh, h),
                ),
                bias,
            );
            let part = |index: usize| {
                sys::ggml_view_1d(
                    graph.ctx,
                    gates,
                    hidden,
                    index * hidden as usize * sys::ggml_element_size(gates),
                )
            };
            let i = sys::ggml_sigmoid(graph.ctx, part(0));
            let f = sys::ggml_sigmoid(graph.ctx, part(1));
            let g = sys::ggml_tanh(graph.ctx, part(2));
            let o = sys::ggml_sigmoid(graph.ctx, part(3));
            let nc = sys::ggml_add(graph.ctx, sys::ggml_mul(graph.ctx, f, c), sys::ggml_mul(graph.ctx, i, g));
            let nh = sys::ggml_mul(graph.ctx, o, sys::ggml_tanh(graph.ctx, nc));
            graph.output(nh);
            graph.output(nc);
            next_h.push(nh);
            next_c.push(nc);
            input = nh;
        }
        let enc = sys::ggml_add(
            graph.ctx,
            sys::ggml_mul_mat(graph.ctx, model.cpu_tensor("joint.enc.weight").unwrap(), encoder),
            model.cpu_tensor("joint.enc.bias").unwrap(),
        );
        let pred = sys::ggml_add(
            graph.ctx,
            sys::ggml_mul_mat(graph.ctx, model.cpu_tensor("joint.pred.weight").unwrap(), input),
            model.cpu_tensor("joint.pred.bias").unwrap(),
        );
        let joined = sys::ggml_relu(graph.ctx, sys::ggml_add(graph.ctx, enc, pred));
        let logits = sys::ggml_add(
            graph.ctx,
            sys::ggml_mul_mat(graph.ctx, model.cpu_tensor("joint.out.weight").unwrap(), joined),
            model.cpu_tensor("joint.out.bias").unwrap(),
        );
        graph.output(logits);
        Ok(Self {
            graph,
            embedding,
            encoder,
            prev_h,
            prev_c,
            next_h,
            next_c,
            logits,
        })
    }
}

impl Model {
    pub fn decode(&self, encoded: &[f32], frames: usize) -> Result<Vec<Token>> {
        let dimension = self.info().encoder_dimension as usize;
        if encoded.len() != frames * dimension {
            return Err(Error::Ggml("encoder output shape"));
        }
        unsafe {
            let runtime = CpuRuntime::new()?;
            let mut step_graph = StepGraph::new(self)?;
            let mut embedding_graph = EmbeddingGraph::new(self)?;
            let hidden = self.info().predictor_hidden as usize;
            let layers = self.info().predictor_layers as usize;
            let mut h = vec![vec![0.0f32; hidden]; layers];
            let mut c = vec![vec![0.0f32; hidden]; layers];
            let mut embedding = vec![0.0f32; hidden];
            let mut output = Vec::new();
            let mut frame = 0;
            let mut symbols = 0;
            let mut iterations = 0;
            while frame < frames && iterations < frames * 16 + 1024 {
                iterations += 1;
                let enc = &encoded[frame * dimension..(frame + 1) * dimension];
                let mut inputs = vec![(step_graph.embedding, embedding.as_slice()), (step_graph.encoder, enc)];
                for layer in 0..layers {
                    inputs.push((step_graph.prev_h[layer], h[layer].as_slice()));
                    inputs.push((step_graph.prev_c[layer], c[layer].as_slice()));
                }
                runtime.execute(&mut step_graph.graph, &inputs)?;
                let mut logits = vec![0.0f32; self.info().vocabulary_size as usize];
                sys::ggml_backend_tensor_get(step_graph.logits, logits.as_mut_ptr().cast(), 0, logits.len() * 4);
                let token = logits
                    .iter()
                    .enumerate()
                    .max_by(|a, b| a.1.total_cmp(b.1))
                    .map(|x| x.0)
                    .unwrap();
                if token as u32 == self.tokenizer().blank_id() {
                    frame += 1;
                    symbols = 0;
                } else {
                    for layer in 0..layers {
                        sys::ggml_backend_tensor_get(step_graph.next_h[layer], h[layer].as_mut_ptr().cast(), 0, hidden * 4);
                        sys::ggml_backend_tensor_get(step_graph.next_c[layer], c[layer].as_mut_ptr().cast(), 0, hidden * 4);
                    }
                    output.push(Token { id: token as u32, frame });
                    embedding = embedding_graph.lookup(&runtime, token as u32, hidden)?;
                    symbols += 1;
                    if symbols >= 10 {
                        frame += 1;
                        symbols = 0;
                    }
                }
            }
            if iterations >= frames * 16 + 1024 {
                return Err(Error::Ggml("RNN-T iteration limit"));
            }
            Ok(output)
        }
    }
}
