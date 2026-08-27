//! Mutable inference state: backend, KV caches, mel, per-decoder sampling
//! state. Mirrors `whisper_state` / `whisper_decoder` from whisper.cpp.

use ggml_rs_sys as sys;

use crate::kv::KvCache;
use crate::mel::Mel;
use crate::model::Model;
use crate::{Error, TokenData};

pub(crate) const MAX_DECODERS: usize = 8;
pub(crate) const MAX_NODES: usize = 4096;

/// Intermediate compute type, whisper.cpp's `wctx.itype`.
pub(crate) const ITYPE: sys::ggml_type = sys::ggml_type_GGML_TYPE_F16;

pub(crate) fn pad_256(n: i32) -> i32 {
    (n + 255) & !255
}

#[derive(Clone, Default)]
pub(crate) struct Sequence {
    pub tokens: Vec<TokenData>,
    pub result_len: usize,
    pub sum_logprobs_all: f64,
    pub sum_logprobs: f64,
    pub avg_logprobs: f64,
    pub entropy: f64,
    pub score: f64,
}

/// MT19937 (the C++ `std::mt19937`, fully specified by the standard), so
/// temperature > 0 sampling draws the same stream whisper.cpp's decoders do.
/// Unlike whisper.cpp — where decoder 0's generator keeps advancing across
/// calls and makes repeated transcriptions differ — every decoder is reseeded
/// at the start of each `full` call, so output is reproducible per request.
#[derive(Clone)]
pub(crate) struct Rng {
    mt: Box<[u32; 624]>,
    index: usize,
}

impl Rng {
    pub fn new(seed: u32) -> Self {
        let mut mt = Box::new([0u32; 624]);
        mt[0] = seed;
        for i in 1..624 {
            mt[i] = 1_812_433_253u32
                .wrapping_mul(mt[i - 1] ^ (mt[i - 1] >> 30))
                .wrapping_add(i as u32);
        }
        Self { mt, index: 624 }
    }

    fn next_u32(&mut self) -> u32 {
        if self.index >= 624 {
            for i in 0..624 {
                let y = (self.mt[i] & 0x8000_0000) | (self.mt[(i + 1) % 624] & 0x7fff_ffff);
                let mut next = self.mt[(i + 397) % 624] ^ (y >> 1);
                if y & 1 != 0 {
                    next ^= 0x9908_b0df;
                }
                self.mt[i] = next;
            }
            self.index = 0;
        }
        let mut y = self.mt[self.index];
        self.index += 1;
        y ^= y >> 11;
        y ^= (y << 7) & 0x9d2c_5680;
        y ^= (y << 15) & 0xefc6_0000;
        y ^ (y >> 18)
    }

    /// Uniform in [0, 1) the way libc++'s `generate_canonical<double, 53>`
    /// maps two 32-bit draws: `(x0 + x1 * 2^32) / 2^64`.
    pub fn next_f64(&mut self) -> f64 {
        let x0 = f64::from(self.next_u32());
        let x1 = f64::from(self.next_u32());
        (x0 + x1 * 4_294_967_296.0) / 18_446_744_073_709_551_616.0
    }

    /// `std::discrete_distribution` as Apple's libc++ implements it: draw a
    /// canonical uniform, then upper_bound over the normalized cumulative
    /// probabilities. whisper.cpp shipped with this exact behaviour, so the
    /// port draws the same token for the same generator state.
    pub fn sample_weighted(&mut self, weights: &[f32]) -> usize {
        let total: f64 = weights.iter().map(|&w| f64::from(w.max(0.0))).sum();
        if total <= 0.0 {
            return 0;
        }
        let u = self.next_f64();
        let mut cumulative = 0.0f64;
        for (i, &w) in weights.iter().enumerate() {
            cumulative += f64::from(w.max(0.0)) / total;
            if u < cumulative {
                return i;
            }
        }
        weights.len() - 1
    }
}

pub(crate) struct DecoderState {
    pub sequence: Sequence,
    pub probs: Vec<f32>,
    pub logits: Vec<f32>,
    pub logprobs: Vec<f32>,
    /// Which row of the batched logits belongs to this decoder.
    pub i_batch: usize,
    pub seek_delta: i32,
    pub failed: bool,
    pub completed: bool,
    pub has_ts: bool,
    pub rng: Rng,
}

impl DecoderState {
    fn new(seed: u32) -> Self {
        Self {
            sequence: Sequence::default(),
            probs: Vec::new(),
            logits: Vec::new(),
            logprobs: Vec::new(),
            i_batch: 0,
            seek_delta: 0,
            failed: false,
            completed: false,
            has_ts: false,
            rng: Rng::new(seed),
        }
    }
}

#[derive(Default)]
pub(crate) struct Batch {
    pub token: Vec<i32>,
    pub pos: Vec<i32>,
    pub seq_id: Vec<i32>,
    pub want_logits: Vec<bool>,
}

impl Batch {
    pub fn clear(&mut self) {
        self.token.clear();
        self.pos.clear();
        self.seq_id.clear();
        self.want_logits.clear();
    }

    pub fn push(&mut self, token: i32, pos: i32, seq_id: i32, want_logits: bool) {
        self.token.push(token);
        self.pos.push(pos);
        self.seq_id.push(seq_id);
        self.want_logits.push(want_logits);
    }

    /// `whisper_batch_prep_legacy`: a full prompt on one sequence, logits for
    /// the last token only.
    pub fn prep_prompt(&mut self, tokens: &[i32], n_past: i32, seq_id: i32) {
        self.clear();
        for (i, &t) in tokens.iter().enumerate() {
            self.push(t, n_past + i as i32, seq_id, i + 1 == tokens.len());
        }
    }

    pub fn len(&self) -> usize {
        self.token.len()
    }
}

pub(crate) struct State {
    /// Backends in scheduling priority order — ACCEL (e.g. BLAS) first, CPU
    /// last, exactly like `whisper_backend_init` with `use_gpu = false`.
    pub backends: Vec<sys::ggml_backend_t>,
    pub kv_self: KvCache,
    pub kv_cross: KvCache,
    /// Scratch KV for the encoder's padded flash-attention window.
    pub kv_pad: KvCache,
    pub kv_self_n_dec: usize,
    /// Mirrors `whisper_context_params.flash_attn` (default true upstream).
    pub flash_attn: bool,

    pub mel: Mel,
    /// Batched decoder output, `[n_tokens][n_vocab]`.
    pub logits: Vec<f32>,
    pub decoders: Vec<DecoderState>,
    pub batch: Batch,

    /// Signal energy for the heuristic token-level timestamps.
    pub energy: Vec<f32>,
    pub t_beg: i64,
    pub t_last: i64,
    pub tid_last: i32,

    pub no_speech_prob: f32,
    pub lang_id: i32,

    /// Static (initial prompt) and rolling text context, kept across calls.
    pub prompt_past0: Vec<i32>,
    pub prompt_past1: Vec<i32>,

    // timing accumulators (microseconds)
    pub t_mel_us: u128,
    pub t_encode_us: u128,
    pub t_decode_us: u128,
    pub t_sample_us: u128,
    pub n_encode: u32,
    pub n_decode: u32,
}

unsafe impl Send for State {}

impl Drop for State {
    fn drop(&mut self) {
        unsafe {
            for &backend in &self.backends {
                if !backend.is_null() {
                    sys::ggml_backend_free(backend);
                }
            }
        }
    }
}

/// Port of `whisper_backend_init_gpu`: the `gpu_device`-th GPU or IGPU
/// device, or null when there is none (or GPU use is disabled).
pub(crate) unsafe fn gpu_device_init(use_gpu: bool, gpu_device: i32) -> sys::ggml_backend_t {
    if !use_gpu {
        return std::ptr::null_mut();
    }
    sys::ggml_backend_load_all();
    let mut cnt = 0;
    for i in 0..sys::ggml_backend_dev_count() {
        let dev = sys::ggml_backend_dev_get(i);
        let dev_type = sys::ggml_backend_dev_type(dev);
        if dev_type == sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU
            || dev_type == sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_IGPU
        {
            if cnt == gpu_device {
                let backend = sys::ggml_backend_dev_init(dev, std::ptr::null());
                if backend.is_null() {
                    tracing::error!("failed to initialize GPU backend");
                } else {
                    tracing::info!(
                        name = ?std::ffi::CStr::from_ptr(sys::ggml_backend_dev_name(dev)),
                        "using GPU backend"
                    );
                }
                return backend;
            }
            cnt += 1;
            if cnt > gpu_device {
                break;
            }
        }
    }
    tracing::info!("no GPU found");
    std::ptr::null_mut()
}

/// Port of `whisper_backend_init`: GPU (when enabled and present), then every
/// ACCEL device (BLAS on macOS), then the CPU backend.
unsafe fn backend_init(use_gpu: bool, gpu_device: i32) -> Result<Vec<sys::ggml_backend_t>, Error> {
    // No-op on static builds; on GGML_BACKEND_DL builds this loads the
    // best-scoring CPU-variant module (and any other backend modules) so the
    // registry below has devices to enumerate.
    sys::ggml_backend_load_all();
    let mut backends = Vec::new();
    let gpu = gpu_device_init(use_gpu, gpu_device);
    if !gpu.is_null() {
        backends.push(gpu);
    }
    for i in 0..sys::ggml_backend_dev_count() {
        let dev = sys::ggml_backend_dev_get(i);
        if sys::ggml_backend_dev_type(dev) == sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_ACCEL {
            let backend = sys::ggml_backend_dev_init(dev, std::ptr::null());
            if backend.is_null() {
                tracing::error!("failed to initialize ACCEL backend");
                continue;
            }
            tracing::info!(
                name = ?std::ffi::CStr::from_ptr(sys::ggml_backend_dev_name(dev)),
                "using ACCEL backend"
            );
            backends.push(backend);
        }
    }
    let cpu = sys::ggml_backend_init_by_type(sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_CPU, std::ptr::null());
    if cpu.is_null() {
        for backend in backends {
            sys::ggml_backend_free(backend);
        }
        return Err(Error::Ggml("cpu backend"));
    }
    backends.push(cpu);
    Ok(backends)
}

impl State {
    pub fn new(model: &Model, n_threads: i32, use_gpu: bool, gpu_device: i32) -> Result<Self, Error> {
        let hp = &model.hparams;
        let _ = n_threads;
        unsafe {
            let backends = backend_init(use_gpu, gpu_device)?;
            let backend = backends[0];

            let kv_self = KvCache::new(
                backend,
                ITYPE,
                i64::from(hp.n_text_state),
                i64::from(hp.n_text_layer),
                i64::from(pad_256(hp.n_text_ctx)),
            )?;
            let kv_cross = KvCache::new(
                backend,
                ITYPE,
                i64::from(hp.n_text_state),
                i64::from(hp.n_text_layer),
                i64::from(pad_256(hp.n_audio_ctx)),
            )?;
            let kv_pad = KvCache::new(
                backend,
                ITYPE,
                i64::from(hp.n_audio_state),
                1,
                i64::from(pad_256(hp.n_audio_ctx)),
            )?;

            let decoders = (0..MAX_DECODERS as u32).map(DecoderState::new).collect();

            Ok(Self {
                backends,
                kv_self,
                kv_cross,
                kv_pad,
                kv_self_n_dec: 1,
                flash_attn: true,
                mel: Mel {
                    n_len: 0,
                    n_len_org: 0,
                    n_mel: 0,
                    data: Vec::new(),
                },
                logits: Vec::new(),
                decoders,
                batch: Batch::default(),
                energy: Vec::new(),
                t_beg: 0,
                t_last: 0,
                tid_last: 0,
                no_speech_prob: 0.0,
                lang_id: 0,
                prompt_past0: Vec::new(),
                prompt_past1: Vec::new(),
                t_mel_us: 0,
                t_encode_us: 0,
                t_decode_us: 0,
                t_sample_us: 0,
                n_encode: 0,
                n_decode: 0,
            })
        }
    }
}
