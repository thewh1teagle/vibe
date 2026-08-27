//! The graph runtime (backend schedulers, graph scratch contexts) and the
//! audio-side graphs, ported from `whisper_build_graph_conv` /
//! `whisper_build_graph_encoder` / `whisper_build_graph_cross`: a mel window
//! in, the cross-attention KV cache filled. Also owns the shared plumbing the
//! decoder graph builds on (`Runtime`, `sched_compute`, `layer_norm`).

use std::ptr;

use ggml_rs_sys as sys;

use crate::model::{Model, Tensor};
use crate::state::{State, ITYPE, MAX_NODES};
use crate::Error;

pub(crate) const F32: sys::ggml_type = sys::ggml_type_GGML_TYPE_F32;
pub(crate) const I32: sys::ggml_type = sys::ggml_type_GGML_TYPE_I32;

/// Persistent graph-building scratch: meta buffers for the node structs and
/// one backend scheduler per graph shape family — the `whisper_sched` port.
pub(crate) struct Runtime {
    meta_conv: Vec<u8>,
    meta_encode: Vec<u8>,
    meta_cross: Vec<u8>,
    pub(crate) meta_decode: Vec<u8>,
    sched_conv: sys::ggml_backend_sched_t,
    sched_encode: sys::ggml_backend_sched_t,
    sched_cross: sys::ggml_backend_sched_t,
    pub(crate) sched_decode: sys::ggml_backend_sched_t,
}

unsafe impl Send for Runtime {}

impl Drop for Runtime {
    fn drop(&mut self) {
        unsafe {
            for sched in [self.sched_conv, self.sched_encode, self.sched_cross, self.sched_decode] {
                if !sched.is_null() {
                    sys::ggml_backend_sched_free(sched);
                }
            }
        }
    }
}

impl Runtime {
    pub fn new(backends: &[sys::ggml_backend_t]) -> Result<Self, Error> {
        unsafe {
            let meta_size = sys::ggml_tensor_overhead() * MAX_NODES + sys::ggml_graph_overhead_custom(MAX_NODES, false);
            let new_sched = || {
                sys::ggml_backend_sched_new(
                    backends.as_ptr().cast_mut(),
                    ptr::null_mut(),
                    backends.len() as i32,
                    MAX_NODES,
                    false,
                    true,
                )
            };
            let sched_conv = new_sched();
            let sched_encode = new_sched();
            let sched_cross = new_sched();
            let sched_decode = new_sched();
            if sched_conv.is_null() || sched_encode.is_null() || sched_cross.is_null() || sched_decode.is_null() {
                return Err(Error::Ggml("backend scheduler"));
            }
            Ok(Self {
                meta_conv: vec![0u8; meta_size],
                meta_encode: vec![0u8; meta_size],
                meta_cross: vec![0u8; meta_size],
                meta_decode: vec![0u8; meta_size],
                sched_conv,
                sched_encode,
                sched_cross,
                sched_decode,
            })
        }
    }
}

/// `ggml_graph_compute_helper` (scheduler flavor): set the thread count on
/// every backend that supports it, compute, reset the scheduler.
pub(crate) unsafe fn sched_compute(sched: sys::ggml_backend_sched_t, graph: *mut sys::ggml_cgraph, n_threads: i32) -> bool {
    for i in 0..sys::ggml_backend_sched_get_n_backends(sched) {
        let backend = sys::ggml_backend_sched_get_backend(sched, i);
        let dev = sys::ggml_backend_get_device(backend);
        if dev.is_null() {
            continue;
        }
        let reg = sys::ggml_backend_dev_backend_reg(dev);
        if reg.is_null() {
            continue;
        }
        let addr = sys::ggml_backend_reg_get_proc_address(reg, c"ggml_backend_set_n_threads".as_ptr());
        if !addr.is_null() {
            let set_n_threads: sys::ggml_backend_set_n_threads_t = std::mem::transmute(addr);
            if let Some(set_n_threads) = set_n_threads {
                set_n_threads(backend, n_threads);
            }
        }
    }
    let ok = sys::ggml_backend_sched_graph_compute(sched, graph) == sys::ggml_status_GGML_STATUS_SUCCESS;
    sys::ggml_backend_sched_reset(sched);
    ok
}



pub(crate) struct GraphCtx {
    pub(crate) ctx: *mut sys::ggml_context,
    pub(crate) graph: *mut sys::ggml_cgraph,
}

impl Drop for GraphCtx {
    fn drop(&mut self) {
        unsafe { sys::ggml_free(self.ctx) };
    }
}

pub(crate) unsafe fn new_graph(meta: &mut [u8]) -> Result<GraphCtx, Error> {
    let ctx = sys::ggml_init(sys::ggml_init_params {
        mem_size: meta.len(),
        mem_buffer: meta.as_mut_ptr().cast(),
        no_alloc: true,
    });
    if ctx.is_null() {
        return Err(Error::Ggml("graph context"));
    }
    let graph = sys::ggml_new_graph_custom(ctx, MAX_NODES, false);
    if graph.is_null() {
        sys::ggml_free(ctx);
        return Err(Error::Ggml("graph"));
    }
    Ok(GraphCtx { ctx, graph })
}

pub(crate) unsafe fn layer_norm(ctx: *mut sys::ggml_context, x: Tensor, w: Tensor, b: Tensor, eps: f32) -> Tensor {
    let cur = sys::ggml_norm(ctx, x, eps);
    sys::ggml_add(ctx, sys::ggml_mul(ctx, cur, w), b)
}

/// Encode the mel window starting at `mel_offset` and fill the cross KV
/// cache. Port of `whisper_encode_internal`.
pub(crate) fn encode(model: &Model, state: &mut State, rt: &mut Runtime, mel_offset: i32, n_threads: i32) -> Result<(), Error> {
    let span = tracing::info_span!("encode", mel_offset);
    let _guard = span.enter();
    let start = std::time::Instant::now();

    let hp = &model.hparams;
    let n_ctx = hp.n_audio_ctx;
    let n_state = hp.n_audio_state;
    let n_head = hp.n_audio_head;
    let n_state_head = n_state / n_head;
    let kq_scale = 1.0f32 / (n_state_head as f32).sqrt();
    let k_scale = (n_state_head as f32).powf(-0.25);
    let n_ctx_pad = crate::state::pad_256(n_ctx);

    unsafe {
        // --- conv graph (whisper_build_graph_conv)
        let g_conv = new_graph(&mut rt.meta_conv)?;
        let embd_conv;
        {
            let ctx0 = g_conv.ctx;
            let mel = sys::ggml_new_tensor_2d(ctx0, F32, i64::from(2 * n_ctx), i64::from(hp.n_mels));
            sys::ggml_set_name(mel, c"mel".as_ptr());
            sys::ggml_set_input(mel);

            let mut cur = sys::ggml_conv_1d_ph(ctx0, model.e_conv_1_w, mel, 1, 1);
            cur = sys::ggml_add(ctx0, cur, model.e_conv_1_b);
            cur = sys::ggml_gelu(ctx0, cur);
            cur = sys::ggml_conv_1d_ph(ctx0, model.e_conv_2_w, cur, 2, 1);
            cur = sys::ggml_add(ctx0, cur, model.e_conv_2_b);
            cur = sys::ggml_gelu(ctx0, cur);
            sys::ggml_set_name(cur, c"embd_conv".as_ptr());
            sys::ggml_set_output(cur);
            sys::ggml_build_forward_expand(g_conv.graph, cur);
            embd_conv = cur;

            if !sys::ggml_backend_sched_alloc_graph(rt.sched_conv, g_conv.graph) {
                return Err(Error::Ggml("conv graph alloc"));
            }

            // Fill the mel input window.
            let n_els = sys::ggml_nelements(mel) as usize;
            let mut inp = vec![0.0f32; n_els];
            let n_len = state.mel.n_len;
            let i0 = mel_offset.min(n_len);
            let i1 = (mel_offset + 2 * n_ctx).min(n_len);
            for j in 0..state.mel.n_mel as usize {
                for i in i0..i1 {
                    inp[j * (2 * n_ctx) as usize + (i - i0) as usize] = state.mel.data[j * n_len as usize + i as usize];
                }
            }
            sys::ggml_backend_tensor_set(mel, inp.as_ptr().cast(), 0, n_els * std::mem::size_of::<f32>());

            if !sched_compute(rt.sched_conv, g_conv.graph, n_threads) {
                return Err(Error::Ggml("conv graph compute"));
            }
        }

        // --- encoder graph (whisper_build_graph_encoder)
        let g_enc = new_graph(&mut rt.meta_encode)?;
        let embd_enc;
        {
            let ctx0 = g_enc.ctx;
            let mut cur = sys::ggml_view_tensor(ctx0, embd_conv);

            // positional embedding (iter is always 0 upstream)
            let e_pe_stride = (*model.e_pe).ne[0] as usize * sys::ggml_element_size(model.e_pe);
            let e_pe = sys::ggml_view_2d(ctx0, model.e_pe, (*model.e_pe).ne[0], i64::from(n_ctx), e_pe_stride, 0);
            cur = sys::ggml_add(ctx0, e_pe, sys::ggml_cont(ctx0, sys::ggml_transpose(ctx0, cur)));

            let mut inp_l = cur;

            for layer in &model.layers_encoder {
                cur = layer_norm(ctx0, inp_l, layer.attn_ln_0_w, layer.attn_ln_0_b, hp.eps);

                // self-attention
                {
                    let mut qcur = sys::ggml_mul_mat(ctx0, layer.attn_q_w, cur);
                    qcur = sys::ggml_add(ctx0, qcur, layer.attn_q_b);
                    let kcur = sys::ggml_mul_mat(ctx0, layer.attn_k_w, cur);
                    let mut vcur = sys::ggml_mul_mat(ctx0, layer.attn_v_w, cur);
                    vcur = sys::ggml_add(ctx0, vcur, layer.attn_v_b);

                    let q = sys::ggml_permute(
                        ctx0,
                        sys::ggml_reshape_3d(ctx0, qcur, i64::from(n_state_head), i64::from(n_head), i64::from(n_ctx)),
                        0,
                        2,
                        1,
                        3,
                    );
                    if state.flash_attn {
                        let es = sys::ggml_element_size(state.kv_pad.k);
                        sys::ggml_build_forward_expand(
                            g_enc.graph,
                            sys::ggml_cpy(
                                ctx0,
                                kcur,
                                sys::ggml_view_1d(ctx0, state.kv_pad.k, i64::from(n_ctx) * i64::from(n_state), 0),
                            ),
                        );
                        sys::ggml_build_forward_expand(
                            g_enc.graph,
                            sys::ggml_cpy(
                                ctx0,
                                vcur,
                                sys::ggml_view_1d(ctx0, state.kv_pad.v, i64::from(n_ctx) * i64::from(n_state), 0),
                            ),
                        );
                        let k = sys::ggml_view_3d(
                            ctx0,
                            state.kv_pad.k,
                            i64::from(n_state_head),
                            i64::from(n_ctx_pad),
                            i64::from(n_head),
                            es * n_state as usize,
                            es * n_state_head as usize,
                            0,
                        );
                        let v = sys::ggml_view_3d(
                            ctx0,
                            state.kv_pad.v,
                            i64::from(n_state_head),
                            i64::from(n_ctx_pad),
                            i64::from(n_head),
                            es * n_state as usize,
                            es * n_state_head as usize,
                            0,
                        );
                        cur = sys::ggml_flash_attn_ext(ctx0, q, k, v, ptr::null_mut(), kq_scale, 0.0, 0.0);
                        cur = sys::ggml_reshape_2d(ctx0, cur, i64::from(n_state), i64::from(n_ctx));
                    } else {
                        let k = sys::ggml_permute(
                            ctx0,
                            sys::ggml_cast(
                                ctx0,
                                sys::ggml_reshape_3d(
                                    ctx0,
                                    kcur,
                                    i64::from(n_state_head),
                                    i64::from(n_head),
                                    i64::from(n_ctx),
                                ),
                                ITYPE,
                            ),
                            0,
                            2,
                            1,
                            3,
                        );
                        let kq = sys::ggml_mul_mat(ctx0, k, q);
                        let kq_soft_max = sys::ggml_soft_max_ext(ctx0, kq, ptr::null_mut(), kq_scale, 0.0);
                        let v = sys::ggml_cast(
                            ctx0,
                            sys::ggml_permute(
                                ctx0,
                                sys::ggml_reshape_3d(
                                    ctx0,
                                    vcur,
                                    i64::from(n_state_head),
                                    i64::from(n_head),
                                    i64::from(n_ctx),
                                ),
                                1,
                                2,
                                0,
                                3,
                            ),
                            ITYPE,
                        );
                        let kqv = sys::ggml_mul_mat(ctx0, v, kq_soft_max);
                        let kqv_merged = sys::ggml_permute(ctx0, kqv, 0, 2, 1, 3);
                        cur = sys::ggml_cont_2d(ctx0, kqv_merged, i64::from(n_state), i64::from(n_ctx));
                    }
                }

                // projection
                cur = sys::ggml_mul_mat(ctx0, layer.attn_ln_1_w, cur);
                cur = sys::ggml_add(ctx0, cur, layer.attn_ln_1_b);

                cur = sys::ggml_add(ctx0, cur, inp_l);
                let inp_ff = cur;

                // feed-forward
                cur = layer_norm(ctx0, inp_ff, layer.mlp_ln_w, layer.mlp_ln_b, hp.eps);
                cur = sys::ggml_mul_mat(ctx0, layer.mlp_0_w, cur);
                cur = sys::ggml_add(ctx0, cur, layer.mlp_0_b);
                cur = sys::ggml_gelu(ctx0, cur);
                cur = sys::ggml_mul_mat(ctx0, layer.mlp_1_w, cur);
                cur = sys::ggml_add(ctx0, cur, layer.mlp_1_b);

                inp_l = sys::ggml_add(ctx0, cur, inp_ff);
            }

            cur = layer_norm(ctx0, inp_l, model.e_ln_w, model.e_ln_b, hp.eps);
            sys::ggml_build_forward_expand(g_enc.graph, cur);
            embd_enc = cur;

            if !sys::ggml_backend_sched_alloc_graph(rt.sched_encode, g_enc.graph) {
                return Err(Error::Ggml("encoder graph alloc"));
            }
            if !sched_compute(rt.sched_encode, g_enc.graph, n_threads) {
                return Err(Error::Ggml("encoder graph compute"));
            }
        }

        // --- cross graph (whisper_build_graph_cross)
        let g_cross = new_graph(&mut rt.meta_cross)?;
        {
            let ctx0 = g_cross.ctx;
            let cur = sys::ggml_view_tensor(ctx0, embd_enc);

            let es_k = sys::ggml_element_size(state.kv_cross.k);
            let es_v = sys::ggml_element_size(state.kv_cross.v);
            for (il, layer) in model.layers_decoder.iter().enumerate() {
                let mut kcross = sys::ggml_mul_mat(ctx0, layer.cross_attn_k_w, cur);
                kcross = sys::ggml_scale(ctx0, kcross, k_scale);
                let mut vcross = sys::ggml_mul_mat(ctx0, layer.cross_attn_v_w, cur);
                vcross = sys::ggml_add(ctx0, vcross, layer.cross_attn_v_b);

                let (k, v) = if state.flash_attn {
                    let k = sys::ggml_view_1d(
                        ctx0,
                        state.kv_cross.k,
                        i64::from(n_state) * i64::from(n_ctx),
                        es_k * n_state as usize * (il * n_ctx_pad as usize),
                    );
                    let v = sys::ggml_view_1d(
                        ctx0,
                        state.kv_cross.v,
                        i64::from(n_state) * i64::from(n_ctx),
                        es_v * n_state as usize * (il * n_ctx_pad as usize),
                    );
                    (k, v)
                } else {
                    vcross = sys::ggml_transpose(
                        ctx0,
                        sys::ggml_reshape_2d(ctx0, vcross, i64::from(n_state), i64::from(n_ctx)),
                    );
                    let k = sys::ggml_view_1d(
                        ctx0,
                        state.kv_cross.k,
                        i64::from(n_state) * i64::from(n_ctx),
                        es_k * n_state as usize * (il * n_ctx as usize),
                    );
                    let v = sys::ggml_view_2d(
                        ctx0,
                        state.kv_cross.v,
                        i64::from(n_ctx),
                        i64::from(n_state),
                        n_ctx as usize * es_v,
                        il * n_ctx as usize * es_v * n_state as usize,
                    );
                    (k, v)
                };
                sys::ggml_build_forward_expand(g_cross.graph, sys::ggml_cpy(ctx0, kcross, k));
                sys::ggml_build_forward_expand(g_cross.graph, sys::ggml_cpy(ctx0, vcross, v));
            }

            if !sys::ggml_backend_sched_alloc_graph(rt.sched_cross, g_cross.graph) {
                return Err(Error::Ggml("cross graph alloc"));
            }
            if !sched_compute(rt.sched_cross, g_cross.graph, n_threads) {
                return Err(Error::Ggml("cross graph compute"));
            }
        }
    }

    state.t_encode_us += start.elapsed().as_micros();
    state.n_encode += 1;
    tracing::info!(elapsed_ms = start.elapsed().as_millis() as u64, "encoded window");
    Ok(())
}

