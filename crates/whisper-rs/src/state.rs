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

/// Deterministic RNG for temperature > 0 sampling. whisper.cpp uses
/// `std::mt19937` + `std::discrete_distribution`, whose exact algorithm is
/// implementation-defined; sampled decoding is not bit-reproducible against
/// the C++ anyway, so a simple splitmix/xorshift is used here.
#[derive(Clone)]
pub(crate) struct Rng(pub u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(seed.wrapping_mul(0x9E3779B97F4A7C15).wrapping_add(1))
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// Weighted index sampling (the `discrete_distribution` stand-in).
    pub fn sample_weighted(&mut self, weights: &[f32]) -> usize {
        let total: f64 = weights.iter().map(|&w| f64::from(w.max(0.0))).sum();
        if total <= 0.0 {
            return 0;
        }
        let mut target = self.next_f64() * total;
        for (i, &w) in weights.iter().enumerate() {
            let w = f64::from(w.max(0.0));
            if target < w {
                return i;
            }
            target -= w;
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
    fn new(seed: u64) -> Self {
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

/// Port of `whisper_backend_init` with `use_gpu = false`: every ACCEL device
/// (BLAS on macOS), then the CPU backend.
unsafe fn backend_init() -> Result<Vec<sys::ggml_backend_t>, Error> {
    // No-op on static builds; on GGML_BACKEND_DL builds this loads the
    // best-scoring CPU-variant module (and any other backend modules) so the
    // registry below has devices to enumerate.
    sys::ggml_backend_load_all();
    let mut backends = Vec::new();
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
    pub fn new(model: &Model, n_threads: i32) -> Result<Self, Error> {
        let hp = &model.hparams;
        let _ = n_threads;
        unsafe {
            let backends = backend_init()?;
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

            let decoders = (0..MAX_DECODERS as u64).map(DecoderState::new).collect();

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
