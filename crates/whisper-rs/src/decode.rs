//! The text-side decoder graph, ported from `whisper_build_graph_decoder` /
//! `whisper_decode_internal`: one batch of tokens in, logits out, reading the
//! cross KV cache and reading/writing the self-attention KV cache.

use std::ptr;

use ggml_rs_sys as sys;

use crate::encode::{layer_norm, new_graph, sched_compute, Runtime, F32, I32};
use crate::model::Model;
use crate::state::{Batch, State};
use crate::Error;

/// Port of `whisper_decode_internal`: run the decoder over one batch and
/// gather logits for the flagged rows.
pub(crate) fn decode(model: &Model, state: &mut State, rt: &mut Runtime, batch: &Batch, n_threads: i32) -> Result<(), Error> {
    let start = std::time::Instant::now();
    let hp = &model.hparams;
    let n_vocab = hp.n_vocab as usize;
    let n_tokens = batch.len();

    // find a KV slot for the batch
    {
        if !state.kv_self.find_slot(&batch.pos, &batch.seq_id) {
            return Err(Error::Ggml("kv cache slot"));
        }
        // pad = 1 on the non-flash CPU path
        state.kv_self.n = state.kv_self.size.min(state.kv_self.cell_max().max(1));
    }

    let n_ctx = state.kv_self.size as i64;
    let n_state = i64::from(hp.n_text_state);
    let n_head = hp.n_text_head;

    let n_state_head = n_state / i64::from(n_head);
    let n_audio_ctx = i64::from(hp.n_audio_ctx);
    let n_audio_ctx_pad = i64::from(crate::state::pad_256(hp.n_audio_ctx));
    let n_kv = state.kv_self.n as i64;
    let kv_head = state.kv_self.head as i64;
    let kq_scale = (n_state_head as f32).powf(-0.25);

    unsafe {
        let g = new_graph(&mut rt.meta_decode)?;
        let ctx0 = g.ctx;

        let embd = sys::ggml_new_tensor_1d(ctx0, I32, n_tokens as i64);
        sys::ggml_set_name(embd, c"embd".as_ptr());
        sys::ggml_set_input(embd);

        let position = sys::ggml_new_tensor_1d(ctx0, I32, n_tokens as i64);
        sys::ggml_set_name(position, c"position".as_ptr());
        sys::ggml_set_input(position);

        let kq_mask = sys::ggml_new_tensor_3d(ctx0, F32, n_kv, n_tokens as i64, 1);
        sys::ggml_set_name(kq_mask, c"KQ_mask".as_ptr());
        sys::ggml_set_input(kq_mask);

        let kq_mask_f16 = sys::ggml_cast(ctx0, kq_mask, sys::ggml_type_GGML_TYPE_F16);

        let mut cur = sys::ggml_add(
            ctx0,
            sys::ggml_get_rows(ctx0, model.d_te, embd),
            sys::ggml_get_rows(ctx0, model.d_pe, position),
        );
        let mut inp_l = cur;

        let es_k = sys::ggml_element_size(state.kv_self.k) as i64;
        let es_v = sys::ggml_element_size(state.kv_self.v) as i64;
        let es_ck = sys::ggml_element_size(state.kv_cross.k) as i64;
        let es_cv = sys::ggml_element_size(state.kv_cross.v) as i64;

        for (il, layer) in model.layers_decoder.iter().enumerate() {
            let il = il as i64;

            cur = layer_norm(ctx0, inp_l, layer.attn_ln_0_w, layer.attn_ln_0_b, hp.eps);

            // self-attention
            {
                let mut qcur = sys::ggml_mul_mat(ctx0, layer.attn_q_w, cur);
                qcur = sys::ggml_add(ctx0, qcur, layer.attn_q_b);
                qcur = sys::ggml_scale(ctx0, qcur, kq_scale);

                let mut kcur = sys::ggml_mul_mat(ctx0, layer.attn_k_w, cur);
                kcur = sys::ggml_scale(ctx0, kcur, kq_scale);

                // store K/V into the cache
                {
                    let mut vcur = sys::ggml_mul_mat(ctx0, layer.attn_v_w, cur);
                    vcur = sys::ggml_add(ctx0, vcur, layer.attn_v_b);

                    let k = sys::ggml_view_1d(
                        ctx0,
                        state.kv_self.k,
                        n_tokens as i64 * n_state,
                        (es_k * n_state * (il * n_ctx + kv_head)) as usize,
                    );
                    let v = if state.flash_attn {
                        sys::ggml_view_1d(
                            ctx0,
                            state.kv_self.v,
                            n_tokens as i64 * n_state,
                            (es_v * n_state * (il * n_ctx + kv_head)) as usize,
                        )
                    } else {
                        vcur = sys::ggml_transpose(ctx0, sys::ggml_reshape_2d(ctx0, vcur, n_state, n_tokens as i64));
                        sys::ggml_view_2d(
                            ctx0,
                            state.kv_self.v,
                            n_tokens as i64,
                            n_state,
                            (n_ctx * es_v) as usize,
                            (il * n_ctx * es_v * n_state + kv_head * es_v) as usize,
                        )
                    };
                    sys::ggml_build_forward_expand(g.graph, sys::ggml_cpy(ctx0, kcur, k));
                    sys::ggml_build_forward_expand(g.graph, sys::ggml_cpy(ctx0, vcur, v));
                }

                let q = sys::ggml_permute(
                    ctx0,
                    sys::ggml_reshape_3d(ctx0, qcur, n_state_head, i64::from(n_head), n_tokens as i64),
                    0,
                    2,
                    1,
                    3,
                );
                let k = sys::ggml_view_3d(
                    ctx0,
                    state.kv_self.k,
                    n_state_head,
                    n_kv,
                    i64::from(n_head),
                    (es_k * n_state) as usize,
                    (es_k * n_state_head) as usize,
                    (es_k * n_state * n_ctx * il) as usize,
                );
                if state.flash_attn {
                    let v = sys::ggml_view_3d(
                        ctx0,
                        state.kv_self.v,
                        n_state_head,
                        n_kv,
                        i64::from(n_head),
                        (es_v * n_state) as usize,
                        (es_v * n_state_head) as usize,
                        (es_v * n_state * n_ctx * il) as usize,
                    );
                    cur = sys::ggml_flash_attn_ext(ctx0, q, k, v, kq_mask_f16, 1.0, 0.0, 0.0);
                    cur = sys::ggml_reshape_2d(ctx0, cur, n_state, n_tokens as i64);
                } else {
                    let kq = sys::ggml_mul_mat(ctx0, k, q);
                    let kq_soft_max = sys::ggml_soft_max_ext(ctx0, kq, kq_mask, 1.0, 0.0);
                    let v = sys::ggml_view_3d(
                        ctx0,
                        state.kv_self.v,
                        n_kv,
                        n_state_head,
                        i64::from(n_head),
                        (n_ctx * es_v) as usize,
                        (n_ctx * es_v * n_state_head) as usize,
                        (n_ctx * es_v * n_state * il) as usize,
                    );
                    let kqv = sys::ggml_mul_mat(ctx0, v, kq_soft_max);
                    let kqv_merged = sys::ggml_permute(ctx0, kqv, 0, 2, 1, 3);
                    cur = sys::ggml_cont_2d(ctx0, kqv_merged, n_state, n_tokens as i64);
                }
            }

            // projection
            cur = sys::ggml_mul_mat(ctx0, layer.attn_ln_1_w, cur);
            cur = sys::ggml_add(ctx0, cur, layer.attn_ln_1_b);

            let inp_ca = sys::ggml_add(ctx0, cur, inp_l);

            cur = layer_norm(ctx0, inp_ca, layer.cross_attn_ln_0_w, layer.cross_attn_ln_0_b, hp.eps);

            // cross-attention
            {
                let mut qcur = sys::ggml_mul_mat(ctx0, layer.cross_attn_q_w, cur);
                qcur = sys::ggml_add(ctx0, qcur, layer.cross_attn_q_b);

                let q = sys::ggml_permute(
                    ctx0,
                    sys::ggml_reshape_3d(ctx0, qcur, n_state_head, i64::from(n_head), n_tokens as i64),
                    0,
                    2,
                    1,
                    3,
                );
                if state.flash_attn {
                    let kcross = sys::ggml_view_3d(
                        ctx0,
                        state.kv_cross.k,
                        n_state_head,
                        n_audio_ctx_pad,
                        i64::from(n_head),
                        (es_ck * n_state) as usize,
                        (es_ck * n_state_head) as usize,
                        (es_ck * n_state * n_audio_ctx_pad * il) as usize,
                    );
                    let vcross = sys::ggml_view_3d(
                        ctx0,
                        state.kv_cross.v,
                        n_state_head,
                        n_audio_ctx_pad,
                        i64::from(n_head),
                        (es_cv * n_state) as usize,
                        (es_cv * n_state_head) as usize,
                        (es_cv * n_state * n_audio_ctx_pad * il) as usize,
                    );
                    cur = sys::ggml_flash_attn_ext(ctx0, q, kcross, vcross, ptr::null_mut(), kq_scale, 0.0, 0.0);
                    cur = sys::ggml_reshape_2d(ctx0, cur, n_state, n_tokens as i64);
                } else {
                    let kcross = sys::ggml_view_3d(
                        ctx0,
                        state.kv_cross.k,
                        n_state_head,
                        n_audio_ctx,
                        i64::from(n_head),
                        (es_ck * n_state) as usize,
                        (es_ck * n_state_head) as usize,
                        (es_ck * n_state * n_audio_ctx * il) as usize,
                    );
                    let vcross = sys::ggml_view_3d(
                        ctx0,
                        state.kv_cross.v,
                        n_audio_ctx,
                        n_state_head,
                        i64::from(n_head),
                        (n_audio_ctx * es_cv) as usize,
                        (n_audio_ctx * es_cv * n_state_head) as usize,
                        (n_audio_ctx * es_cv * n_state * il) as usize,
                    );
                    let kq = sys::ggml_mul_mat(ctx0, kcross, q);
                    let kq_soft_max = sys::ggml_soft_max_ext(ctx0, kq, ptr::null_mut(), kq_scale, 0.0);
                    let kqv = sys::ggml_mul_mat(ctx0, vcross, kq_soft_max);
                    let kqv_merged = sys::ggml_permute(ctx0, kqv, 0, 2, 1, 3);
                    cur = sys::ggml_cont_2d(ctx0, kqv_merged, n_state, n_tokens as i64);
                }
            }

            // projection
            cur = sys::ggml_mul_mat(ctx0, layer.cross_attn_ln_1_w, cur);
            cur = sys::ggml_add(ctx0, cur, layer.cross_attn_ln_1_b);

            cur = sys::ggml_add(ctx0, cur, inp_ca);
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


        cur = layer_norm(ctx0, inp_l, model.d_ln_w, model.d_ln_b, hp.eps);
        let logits = sys::ggml_mul_mat(ctx0, model.d_te, cur);
        sys::ggml_build_forward_expand(g.graph, logits);

        if !sys::ggml_backend_sched_alloc_graph(rt.sched_decode, g.graph) {
            return Err(Error::Ggml("decoder graph alloc"));
        }

        // inputs
        sys::ggml_backend_tensor_set(embd, batch.token.as_ptr().cast(), 0, n_tokens * 4);
        sys::ggml_backend_tensor_set(position, batch.pos.as_ptr().cast(), 0, n_tokens * 4);
        {
            let mut mask = vec![0.0f32; (n_kv as usize) * n_tokens];
            for j in 0..n_tokens {
                let pos = batch.pos[j];
                let seq_id = batch.seq_id[j];
                for i in 0..n_kv as usize {
                    let cell = &state.kv_self.cells[i];
                    if !cell.seq_id.contains(&seq_id) || cell.pos > pos {
                        mask[j * n_kv as usize + i] = f32::NEG_INFINITY;
                    }
                }
            }
            sys::ggml_backend_tensor_set(kq_mask, mask.as_ptr().cast(), 0, mask.len() * 4);
        }

        if !sched_compute(rt.sched_decode, g.graph, n_threads) {
            return Err(Error::Ggml("decoder graph compute"));
        }

        // gather logits for flagged rows
        state.logits.resize(n_tokens * n_vocab, 0.0);
        for (i, &want) in batch.want_logits.iter().enumerate() {
            if !want {
                continue;
            }
            sys::ggml_backend_tensor_get(
                logits,
                state.logits.as_mut_ptr().add(i * n_vocab).cast(),
                i * n_vocab * std::mem::size_of::<f32>(),
                n_vocab * std::mem::size_of::<f32>(),
            );
        }
    }

    state.t_decode_us += start.elapsed().as_micros();
    state.n_decode += 1;
    tracing::debug!(
        n_tokens,
        n_kv = state.kv_self.n,
        elapsed_us = start.elapsed().as_micros() as u64,
        "decoded batch"
    );
    Ok(())
}
