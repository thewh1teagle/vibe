//! The Silero VAD forward pass on ggml.
//!
//! A line-for-line port of whisper.cpp's `whisper_vad_build_graph` and
//! `whisper_vad_detect_speech` (whisper.cpp:4533-4667, 5104-5181) at the
//! pinned commit, so the per-window speech probabilities are bit-identical to
//! what `whisper_vad_segments_from_samples` computed. whisper.cpp forces the
//! VAD onto the CPU backend (whisper.cpp:4674), so this port does not carry a
//! GPU path at all.

use std::ptr;

use ggml_rs_sys as sys;

use crate::model::{Model, Tensor};

/// whisper.cpp's `whisper_vad_default_context_params().n_threads`.
const N_THREADS: i32 = 4;

pub(crate) struct Silero {
    model: Model,
    backend: sys::ggml_backend_t,
    /// Context and buffer owning the LSTM hidden/cell state between windows.
    state_ctx: *mut sys::ggml_context,
    state_buffer: sys::ggml_backend_buffer_t,
    /// Context owning the compute graph; kept alive because the graph is
    /// allocated once and re-run for every window.
    graph_ctx: *mut sys::ggml_context,
    graph: *mut sys::ggml_cgraph,
    allocator: sys::ggml_gallocr_t,
    frame: Tensor,
    prob: Tensor,
}

unsafe impl Send for Silero {}

impl Drop for Silero {
    fn drop(&mut self) {
        unsafe {
            if !self.allocator.is_null() {
                sys::ggml_gallocr_free(self.allocator);
            }
            if !self.graph_ctx.is_null() {
                sys::ggml_free(self.graph_ctx);
            }
            if !self.state_buffer.is_null() {
                sys::ggml_backend_buffer_free(self.state_buffer);
            }
            if !self.state_ctx.is_null() {
                sys::ggml_free(self.state_ctx);
            }
            if !self.backend.is_null() {
                sys::ggml_backend_free(self.backend);
            }
        }
    }
}

impl Silero {
    pub(crate) fn n_window(&self) -> usize {
        self.model.hparams.n_window as usize
    }

    pub(crate) fn new(model: Model) -> Option<Self> {
        unsafe {
            let backend = init_cpu_backend(N_THREADS);
            if backend.is_null() {
                return None;
            }

            let mut silero = Self {
                model,
                backend,
                state_ctx: ptr::null_mut(),
                state_buffer: ptr::null_mut(),
                graph_ctx: ptr::null_mut(),
                graph: ptr::null_mut(),
                allocator: ptr::null_mut(),
                frame: ptr::null_mut(),
                prob: ptr::null_mut(),
            };

            // LSTM hidden and cell state, allocated in a backend buffer so
            // resetting is a buffer clear, exactly like whisper_vad_init_context.
            let hidden = i64::from(silero.model.hparams.lstm_hidden_size);
            silero.state_ctx = sys::ggml_init(sys::ggml_init_params {
                mem_size: 2 * sys::ggml_tensor_overhead(),
                mem_buffer: ptr::null_mut(),
                no_alloc: true,
            });
            if silero.state_ctx.is_null() {
                return None;
            }
            let h_state = sys::ggml_new_tensor_1d(silero.state_ctx, sys::ggml_type_GGML_TYPE_F32, hidden);
            let c_state = sys::ggml_new_tensor_1d(silero.state_ctx, sys::ggml_type_GGML_TYPE_F32, hidden);
            silero.state_buffer = sys::ggml_backend_alloc_ctx_tensors(silero.state_ctx, silero.backend);
            if silero.state_buffer.is_null() {
                return None;
            }

            silero.graph_ctx = sys::ggml_init(sys::ggml_init_params {
                mem_size: sys::ggml_graph_overhead() + 256 * sys::ggml_tensor_overhead() + 16 * 1024,
                mem_buffer: ptr::null_mut(),
                no_alloc: true,
            });
            if silero.graph_ctx.is_null() {
                return None;
            }
            silero.build_graph(h_state, c_state)?;

            silero.allocator = sys::ggml_gallocr_new(sys::ggml_backend_get_default_buffer_type(silero.backend));
            if silero.allocator.is_null() || !sys::ggml_gallocr_alloc_graph(silero.allocator, silero.graph) {
                return None;
            }
            Some(silero)
        }
    }

    /// Mirror of `whisper_vad_build_graph`. `h_state`/`c_state` are read by
    /// the LSTM and written back through `ggml_cpy`, carrying the recurrent
    /// state from one window to the next.
    unsafe fn build_graph(&mut self, h_state: Tensor, c_state: Tensor) -> Option<()> {
        let ctx0 = self.graph_ctx;
        let model = &self.model;
        let hparams = &model.hparams;
        let gf = sys::ggml_new_graph(ctx0);
        if gf.is_null() {
            return None;
        }

        let frame = sys::ggml_new_tensor_2d(ctx0, sys::ggml_type_GGML_TYPE_F32, i64::from(hparams.n_window), 1);
        sys::ggml_set_input(frame);

        // STFT as a strided convolution against the precomputed Fourier basis,
        // preceded by the 64-sample reflective pad. The hop size is
        // lstm_input_size in the C++, odd as that reads.
        let hop = hparams.lstm_input_size;
        let padded = sys::ggml_pad_reflect_1d(ctx0, frame, 64, 64);
        let stft = sys::ggml_conv_1d(ctx0, model.stft_basis, padded, hop, 0, 1);
        let n_frames = (hparams.n_window + 128 - (*model.stft_basis).ne[0] as i32) / hop + 1;

        // First half of the filter bank is the real part, second half the
        // imaginary part; combine into the magnitude spectrum.
        let cutoff = (*model.stft_basis).ne[2] / 2;
        let real = sys::ggml_view_2d(ctx0, stft, i64::from(n_frames), cutoff, (*stft).nb[1], 0);
        let imag = sys::ggml_view_2d(
            ctx0,
            stft,
            i64::from(n_frames),
            cutoff,
            (*stft).nb[1],
            cutoff as usize * (*stft).nb[1],
        );
        let sum_squares = sys::ggml_add(
            ctx0,
            sys::ggml_mul(ctx0, real, real),
            sys::ggml_mul(ctx0, imag, imag),
        );
        let mut cur = sys::ggml_sqrt(ctx0, sum_squares);

        // Four Conv1d+ReLU encoder layers with strides 1, 2, 2, 1.
        for (layer, &stride) in [1, 2, 2, 1].iter().enumerate() {
            let (weight, bias) = model.encoder[layer];
            cur = sys::ggml_conv_1d(ctx0, weight, cur, stride, 1, 1);
            let channels = i64::from(hparams.encoder_out_channels[layer]);
            cur = sys::ggml_add(ctx0, cur, sys::ggml_reshape_3d(ctx0, bias, 1, channels, 1));
            cur = sys::ggml_relu(ctx0, cur);
        }

        // Equivalent of pytorch's [:, :, 0].
        let hidden = i64::from(hparams.lstm_hidden_size);
        cur = sys::ggml_view_2d(ctx0, cur, 1, hidden, (*cur).nb[1], 0);

        // Single LSTM cell.
        let x_t = sys::ggml_transpose(ctx0, cur);
        let inp_gate = sys::ggml_add(ctx0, sys::ggml_mul_mat(ctx0, model.lstm_ih_weight, x_t), model.lstm_ih_bias);
        let hid_gate = sys::ggml_add(
            ctx0,
            sys::ggml_mul_mat(ctx0, model.lstm_hh_weight, h_state),
            model.lstm_hh_bias,
        );
        let out_gate = sys::ggml_add(ctx0, inp_gate, hid_gate);

        let hidden_size = sys::ggml_row_size((*out_gate).type_, hidden);
        let i_t = sys::ggml_sigmoid(ctx0, sys::ggml_view_1d(ctx0, out_gate, hidden, 0));
        let f_t = sys::ggml_sigmoid(ctx0, sys::ggml_view_1d(ctx0, out_gate, hidden, hidden_size));
        let g_t = sys::ggml_tanh(ctx0, sys::ggml_view_1d(ctx0, out_gate, hidden, 2 * hidden_size));
        let o_t = sys::ggml_sigmoid(ctx0, sys::ggml_view_1d(ctx0, out_gate, hidden, 3 * hidden_size));

        let c_out = sys::ggml_add(
            ctx0,
            sys::ggml_mul(ctx0, f_t, c_state),
            sys::ggml_mul(ctx0, i_t, g_t),
        );
        sys::ggml_build_forward_expand(gf, sys::ggml_cpy(ctx0, c_out, c_state));
        let out = sys::ggml_mul(ctx0, o_t, sys::ggml_tanh(ctx0, c_out));
        sys::ggml_build_forward_expand(gf, sys::ggml_cpy(ctx0, out, h_state));

        // ReLU, 1x1 conv down to a single logit, sigmoid.
        cur = sys::ggml_relu(ctx0, out);
        cur = sys::ggml_conv_1d(ctx0, model.final_conv_weight, cur, 1, 0, 1);
        cur = sys::ggml_add(ctx0, cur, model.final_conv_bias);
        cur = sys::ggml_sigmoid(ctx0, cur);
        sys::ggml_set_output(cur);
        sys::ggml_build_forward_expand(gf, cur);

        self.graph = gf;
        self.frame = frame;
        self.prob = cur;
        Some(())
    }

    /// Mirror of `whisper_vad_detect_speech`: reset the LSTM state, then run
    /// the graph over consecutive windows (the last one zero-padded) and
    /// collect one speech probability per window.
    pub(crate) fn probs(&mut self, samples: &[f32]) -> Option<Vec<f32>> {
        let n_window = self.n_window();
        let n_chunks = samples.len().div_ceil(n_window);
        let mut probs = Vec::with_capacity(n_chunks);
        let mut window = vec![0.0f32; n_window];
        unsafe {
            sys::ggml_backend_buffer_clear(self.state_buffer, 0);
            for chunk in 0..n_chunks {
                let start = chunk * n_window;
                let end = (start + n_window).min(samples.len());
                window[..end - start].copy_from_slice(&samples[start..end]);
                window[end - start..].fill(0.0);
                sys::ggml_backend_tensor_set(
                    self.frame,
                    window.as_ptr().cast(),
                    0,
                    std::mem::size_of_val(window.as_slice()),
                );
                if sys::ggml_backend_graph_compute(self.backend, self.graph) != sys::ggml_status_GGML_STATUS_SUCCESS {
                    return None;
                }
                let mut prob = 0.0f32;
                sys::ggml_backend_tensor_get(self.prob, (&mut prob as *mut f32).cast(), 0, std::mem::size_of::<f32>());
                probs.push(prob);
            }
        }
        Some(probs)
    }
}

/// Loads dynamically-built backends once per process. A no-op on static
/// builds (macOS); on GGML_BACKEND_DL builds (x86 Linux/Windows) this picks
/// the best CPU-variant module for the running machine by cpuid score.
fn load_backends_once() {
    static LOAD: std::sync::Once = std::sync::Once::new();
    LOAD.call_once(|| unsafe { sys::ggml_backend_load_all() });
}

/// Sets the thread count through the backend registry. The direct
/// `ggml_backend_cpu_set_n_threads` symbol does not exist in
/// GGML_BACKEND_DL builds, where the CPU backend is a loadable module.
unsafe fn set_backend_n_threads(backend: sys::ggml_backend_t, n_threads: i32) {
    let dev = sys::ggml_backend_get_device(backend);
    if dev.is_null() {
        return;
    }
    let reg = sys::ggml_backend_dev_backend_reg(dev);
    if reg.is_null() {
        return;
    }
    let addr = sys::ggml_backend_reg_get_proc_address(reg, c"ggml_backend_set_n_threads".as_ptr());
    if !addr.is_null() {
        let set_n_threads: sys::ggml_backend_set_n_threads_t = std::mem::transmute(addr);
        if let Some(set_n_threads) = set_n_threads {
            set_n_threads(backend, n_threads);
        }
    }
}

/// Registry-based CPU backend init (`ggml_backend_cpu_init` does not link
/// against GGML_BACKEND_DL builds).
unsafe fn init_cpu_backend(n_threads: i32) -> sys::ggml_backend_t {
    load_backends_once();
    let backend = sys::ggml_backend_init_by_type(
        sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_CPU,
        std::ptr::null(),
    );
    if !backend.is_null() {
        set_backend_n_threads(backend, n_threads);
    }
    backend
}
