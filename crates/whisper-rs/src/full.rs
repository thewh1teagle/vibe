//! Port of `whisper_full_with_state`: language detection, the
//! temperature-fallback decoding loop over the audio, and segment emission.
//! The per-token logit filtering and sampling it drives lives in
//! [`crate::sampling`].

use crate::decode::decode;
use crate::encode::{encode, Runtime};
use crate::lang;
use crate::mel::{log_mel_spectrogram, CHUNK_SIZE};
use crate::model::Model;
use crate::sampling::{
    compute_logprobs, compute_probs, process_logits, sample_token, sample_token_topk, sequence_score,
    sequence_tokens_equal,
};
use crate::state::{Rng, Sequence, State, MAX_DECODERS};
use crate::timestamps::{compute_token_level_timestamps, signal_energy, wrap_segment, TimestampState};
use crate::{Error, FullCallbacks, FullParams, FullSegment, SamplingStrategy};

/// `whisper.cpp`'s cutoff above which history conditioning is dropped.
const HISTORY_CONDITIONING_TEMP_CUTOFF: f32 = 0.5;

/// `whisper_lang_auto_detect_with_state`.
fn lang_auto_detect(model: &Model, state: &mut State, rt: &mut Runtime, n_threads: i32) -> Result<i32, Error> {
    let span = tracing::info_span!("lang_detect");
    let _guard = span.enter();

    if state.mel.n_len_org <= 0 {
        return Err(Error::LanguageDetection);
    }
    encode(model, state, rt, 0, n_threads)?;

    state.kv_self.seq_rm(0, 0, -1);
    state.batch.prep_prompt(&[model.vocab.token_sot], 0, 0);
    let batch = std::mem::take(&mut state.batch);
    decode(model, state, rt, &batch, n_threads)?;
    state.batch = batch;

    let mut best = (f32::NEG_INFINITY, -1i32);
    for id in 0..lang::LANGUAGES.len() {
        let logit = state.logits[model.vocab.token_lang(id) as usize];
        if logit > best.0 {
            best = (logit, id as i32);
        }
    }
    if best.1 < 0 {
        return Err(Error::LanguageDetection);
    }
    tracing::info!(lang = lang::lang_str(best.1 as usize), "auto-detected language");
    Ok(best.1)
}

struct BeamCandidate {
    decoder_idx: usize,
    seek_delta: i32,
    has_ts: bool,
    sequence: Sequence,
}

/// The `whisper_full_with_state` port.
#[allow(clippy::needless_range_loop)] // decoder loops mirror the C++ for parity
pub(crate) fn full(
    model: &Model,
    state: &mut State,
    rt: &mut Runtime,
    params: &FullParams,
    samples: &[f32],
    callbacks: &mut FullCallbacks<'_>,
) -> Result<Vec<FullSegment>, Error> {
    let span = tracing::info_span!("full", n_samples = samples.len());
    let _guard = span.enter();
    let t_full = std::time::Instant::now();

    let mut params = params.clone();
    let mut result_all: Vec<FullSegment> = Vec::new();

    // mel
    if !samples.is_empty() {
        let t0 = std::time::Instant::now();
        state.mel = log_mel_spectrogram(samples, &model.filters, model.filters.n_mel);
        state.t_mel_us += t0.elapsed().as_micros();
    }

    // language auto-detect
    let needs_detect = params.detect_language
        || params
            .language
            .as_deref()
            .map(|l| l.is_empty() || l == "auto")
            .unwrap_or(true);
    if needs_detect {
        let lang_id = lang_auto_detect(model, state, rt, params.n_threads)?;
        state.lang_id = lang_id;
        params.language = lang::lang_str(lang_id as usize).map(str::to_string);
        if params.detect_language {
            return Ok(result_all);
        }
    }

    if params.token_timestamps {
        state.t_beg = 0;
        state.t_last = 0;
        state.tid_last = 0;
        if !samples.is_empty() {
            state.energy = signal_energy(samples, 32);
        }
    }

    let seek_start = params.offset_ms / 10;
    let seek_end = if params.duration_ms == 0 {
        state.mel.n_len_org
    } else {
        seek_start + params.duration_ms / 10
    };
    let delta_min = 10;
    if seek_end < seek_start + delta_min {
        tracing::warn!(
            ms = (seek_end - seek_start) * 10,
            "input is too short; consider padding with silence"
        );
        return Ok(result_all);
    }

    // temperatures for the fallback ladder
    let mut temperatures = Vec::new();
    if params.temperature_inc > 0.0 {
        let mut t = params.temperature;
        while t < 1.0 + 1e-6 {
            temperatures.push(t);
            t += params.temperature_inc;
        }
    } else {
        temperatures.push(params.temperature);
    }

    // decoder pool size
    let n_decoders = match params.strategy {
        SamplingStrategy::Greedy => params.greedy_best_of,
        SamplingStrategy::BeamSearch => params.greedy_best_of.max(params.beam_size),
    }
    .max(1) as usize;
    if n_decoders > MAX_DECODERS {
        return Err(Error::Ggml("too many decoders requested"));
    }

    if params.no_context {
        state.prompt_past0.clear();
        state.prompt_past1.clear();
    }

    let max_prompt_ctx = params.n_max_text_ctx.min(model.hparams.n_text_ctx / 2) as usize;

    // initial prompt
    let mut prompt_tokens: Vec<i32> = Vec::new();
    if let Some(text) = &params.initial_prompt {
        prompt_tokens = model.vocab.tokenize(text);
    }
    if !prompt_tokens.is_empty() {
        if params.carry_initial_prompt {
            if state.prompt_past0.is_empty() {
                let max_tokens = max_prompt_ctx.saturating_sub(1).max(1);
                if prompt_tokens.len() > max_tokens {
                    tracing::warn!(
                        n = prompt_tokens.len(),
                        max = max_tokens,
                        "initial prompt is too long; keeping the tail"
                    );
                }
                let n = prompt_tokens.len().min(max_tokens);
                state.prompt_past0 = prompt_tokens[prompt_tokens.len() - n..].to_vec();
            }
        } else {
            // append then rotate to the front
            let mut rotated = prompt_tokens.clone();
            rotated.extend_from_slice(&state.prompt_past1);
            state.prompt_past1 = rotated;
        }
    }

    // task tokens
    let mut prompt_init = vec![model.vocab.token_sot];
    if model.vocab.is_multilingual() {
        let language = params.language.clone().unwrap_or_default();
        let lang_id = lang::lang_id(&language).ok_or(Error::UnknownLanguage(language))? as i32;
        state.lang_id = lang_id;
        prompt_init.push(model.vocab.token_lang(lang_id as usize));
        if params.translate {
            prompt_init.push(model.vocab.token_translate);
        } else {
            prompt_init.push(model.vocab.token_transcribe);
        }
    }

    // first-release distilled models require no_timestamps
    let is_distil = model.hparams.n_text_layer == 2 && model.hparams.n_vocab != 51866;
    if is_distil && !params.no_timestamps {
        tracing::warn!("first-release distilled model - forcing no_timestamps");
        params.no_timestamps = true;
    }
    if params.no_timestamps {
        prompt_init.push(model.vocab.token_not);
    }

    let mut seek = seek_start;
    let mut prompt: Vec<i32> = Vec::with_capacity(model.hparams.n_text_ctx as usize);

    // main loop over the audio
    while seek + delta_min < seek_end {
        let progress = (100 * (seek - seek_start)) / (seek_end - seek_start);
        tracing::info!(progress, seek, "processing window");
        if let Some(on_progress) = callbacks.on_progress.as_mut() {
            on_progress(progress);
        }
        if let Some(should_abort) = callbacks.should_abort.as_mut() {
            if should_abort() {
                return Err(Error::Aborted);
            }
        }

        encode(model, state, rt, seek, params.n_threads)?;

        // drop stale context for a trailing very short window
        if seek > seek_start && seek + 500 >= seek_end {
            state.prompt_past0.clear();
            state.prompt_past1.clear();
        }

        let mut best_decoder_id = 0usize;

        for (it, &t_cur) in temperatures.iter().enumerate() {
            let n_decoders_cur = match params.strategy {
                SamplingStrategy::Greedy => {
                    if t_cur > 0.0 {
                        params.greedy_best_of.max(1) as usize
                    } else {
                        1
                    }
                }
                SamplingStrategy::BeamSearch => {
                    if t_cur > 0.0 {
                        params.greedy_best_of.max(1) as usize
                    } else {
                        params.beam_size.max(1) as usize
                    }
                }
            };
            tracing::debug!(temperature = t_cur, n_decoders_cur, "decoding attempt");

            for j in 0..n_decoders_cur {
                let decoder = &mut state.decoders[j];
                decoder.sequence.tokens.clear();
                decoder.sequence.result_len = 0;
                decoder.sequence.sum_logprobs_all = 0.0;
                decoder.sequence.sum_logprobs = f64::NEG_INFINITY;
                decoder.sequence.avg_logprobs = f64::NEG_INFINITY;
                decoder.sequence.entropy = 0.0;
                decoder.sequence.score = f64::NEG_INFINITY;
                decoder.seek_delta = 100 * CHUNK_SIZE as i32;
                decoder.failed = false;
                decoder.completed = false;
                decoder.has_ts = false;
                decoder.rng = Rng::new(j as u64);
            }

            // build the prompt for this iteration
            {
                prompt.clear();
                if params.n_max_text_ctx > 0 && t_cur < HISTORY_CONDITIONING_TEMP_CUTOFF {
                    let can_take0 = params.carry_initial_prompt && !state.prompt_past0.is_empty();
                    let can_take1 = !state.prompt_past1.is_empty();
                    if max_prompt_ctx > 0 && (can_take0 || can_take1) {
                        prompt.push(model.vocab.token_prev);
                        let mut n_take0 = 0usize;
                        if can_take0 {
                            n_take0 = state.prompt_past0.len();
                            prompt.extend_from_slice(&state.prompt_past0);
                        }
                        let n_take1 = max_prompt_ctx
                            .saturating_sub(n_take0)
                            .saturating_sub(1)
                            .min(state.prompt_past1.len());
                        let past1 = &state.prompt_past1;
                        prompt.extend_from_slice(&past1[past1.len() - n_take1..]);
                    }
                }
                prompt.extend_from_slice(&prompt_init);

                // recreate the KV cache if more decoders are needed
                if state.kv_self_n_dec < n_decoders_cur {
                    let factor = if n_decoders_cur > 1 { n_decoders_cur + 2 } else { 1 };
                    let n_ctx = i64::from(crate::state::pad_256(model.hparams.n_text_ctx)) * factor as i64;
                    state.kv_self = crate::kv::KvCache::new(
                        state.backends[0],
                        crate::state::ITYPE,
                        i64::from(model.hparams.n_text_state),
                        i64::from(model.hparams.n_text_layer),
                        n_ctx,
                    )?;
                    state.kv_self_n_dec = n_decoders_cur;
                }

                state.kv_self.clear();
                state.batch.prep_prompt(&prompt, 0, 0);
                let batch = std::mem::take(&mut state.batch);
                decode(model, state, rt, &batch, params.n_threads)?;
                state.batch = batch;

                // no-speech probability, computed before any filtering
                {
                    let n_logits = model.vocab.n_vocab as usize;
                    let mut logprobs = Vec::new();
                    let mut probs = Vec::new();
                    compute_logprobs(&state.logits, n_logits, &mut logprobs);
                    compute_probs(&state.logits, n_logits, &logprobs, &mut probs);
                    state.no_speech_prob = probs[model.vocab.token_nosp as usize];
                }

                let t0 = std::time::Instant::now();
                state.decoders[0].i_batch = prompt.len() - 1;
                {
                    let logits = std::mem::take(&mut state.logits);
                    process_logits(model, &logits, &mut state.decoders[0], &params, t_cur);
                    state.logits = logits;
                }
                for j in 1..n_decoders_cur {
                    state.kv_self.seq_cp(0, j as i32, -1, -1);
                    let (head, tail) = state.decoders.split_at_mut(j);
                    tail[0].probs = head[0].probs.clone();
                    tail[0].logits = head[0].logits.clone();
                    tail[0].logprobs = head[0].logprobs.clone();
                }
                state.t_sample_us += t0.elapsed().as_micros();
            }

            let n_max = (model.hparams.n_text_ctx / 2 - 4) as usize;
            let mut bc_per_dec: Vec<Vec<BeamCandidate>> = (0..n_decoders_cur).map(|_| Vec::new()).collect();

            for i in 0..n_max {
                let t_sample = std::time::Instant::now();

                if params.strategy == SamplingStrategy::BeamSearch {
                    for bc in &mut bc_per_dec {
                        bc.clear();
                    }
                }

                // sampling
                for j in 0..n_decoders_cur {
                    if state.decoders[j].completed || state.decoders[j].failed {
                        continue;
                    }
                    match params.strategy {
                        SamplingStrategy::Greedy => {
                            let token = {
                                let decoder = &mut state.decoders[j];
                                sample_token(&model.vocab, decoder, t_cur < 1e-6)
                            };
                            let decoder = &mut state.decoders[j];
                            decoder.sequence.sum_logprobs_all += f64::from(token.plog);
                            decoder.sequence.tokens.push(token);
                        }
                        SamplingStrategy::BeamSearch => {
                            let tokens_new = {
                                let decoder = &mut state.decoders[j];
                                sample_token_topk(&model.vocab, decoder, params.beam_size.max(1) as usize)
                            };
                            let decoder = &state.decoders[j];
                            for token in tokens_new {
                                let mut sequence = decoder.sequence.clone();
                                sequence.sum_logprobs_all += f64::from(token.plog);
                                sequence.tokens.push(token);
                                bc_per_dec[j].push(BeamCandidate {
                                    decoder_idx: j,
                                    seek_delta: decoder.seek_delta,
                                    has_ts: decoder.has_ts,
                                    sequence,
                                });
                            }
                        }
                    }
                }

                // beam-search: pick the top candidates, remap KV sequences
                if params.strategy == SamplingStrategy::BeamSearch {
                    let mut beam_candidates: Vec<BeamCandidate> = Vec::new();
                    for bc in bc_per_dec.drain(..) {
                        beam_candidates.extend(bc);
                    }
                    bc_per_dec = (0..n_decoders_cur).map(|_| Vec::new()).collect();

                    beam_candidates.sort_by(|a, b| {
                        match b
                            .sequence
                            .sum_logprobs_all
                            .partial_cmp(&a.sequence.sum_logprobs_all)
                            .unwrap_or(std::cmp::Ordering::Equal)
                        {
                            std::cmp::Ordering::Equal => a.decoder_idx.cmp(&b.decoder_idx),
                            other => other,
                        }
                    });

                    let mut cur_c = 0usize;
                    for j in 0..n_decoders_cur {
                        if state.decoders[j].completed || state.decoders[j].failed {
                            continue;
                        }
                        if cur_c >= beam_candidates.len() {
                            cur_c = 0;
                        }
                        // skip duplicates
                        let picked = cur_c;
                        cur_c += 1;
                        while cur_c < beam_candidates.len()
                            && sequence_tokens_equal(&beam_candidates[cur_c].sequence, &beam_candidates[picked].sequence)
                            && i > 0
                        {
                            cur_c += 1;
                        }
                        let cur = &beam_candidates[picked];
                        let decoder = &mut state.decoders[j];
                        decoder.seek_delta = cur.seek_delta;
                        decoder.has_ts = cur.has_ts;
                        decoder.sequence = cur.sequence.clone();
                        state
                            .kv_self
                            .seq_cp(cur.decoder_idx as i32, (MAX_DECODERS + j) as i32, -1, -1);
                    }
                    for j in 0..n_decoders_cur {
                        if state.decoders[j].completed || state.decoders[j].failed {
                            continue;
                        }
                        state.kv_self.seq_rm(j as i32, -1, -1);
                        state.kv_self.seq_cp((MAX_DECODERS + j) as i32, j as i32, -1, -1);
                        state.kv_self.seq_rm((MAX_DECODERS + j) as i32, -1, -1);
                    }
                }

                // update decoder state
                for j in 0..n_decoders_cur {
                    let decoder = &mut state.decoders[j];
                    if decoder.completed || decoder.failed {
                        continue;
                    }

                    {
                        let token = decoder.sequence.tokens.last().unwrap().clone();

                        // timestamp token - update sliding window
                        if token.id > model.vocab.token_beg {
                            let seek_delta_new = 2 * (token.id - model.vocab.token_beg);
                            if decoder.has_ts
                                && decoder.seek_delta > seek_delta_new
                                && decoder.sequence.result_len < i
                            {
                                tracing::debug!(decoder = j, "failed due to seek_delta regression");
                                decoder.failed = true;
                                continue;
                            }
                            decoder.seek_delta = seek_delta_new;
                            decoder.sequence.result_len = i + 1;
                            decoder.has_ts = true;
                        }

                        // end of segment
                        if token.id == model.vocab.token_eot
                            || (params.max_tokens > 0 && i as i32 >= params.max_tokens)
                            || (decoder.has_ts && seek + decoder.seek_delta + delta_min >= seek_end)
                        {
                            if decoder.sequence.result_len == 0 && !params.no_timestamps {
                                if seek + decoder.seek_delta + delta_min >= seek_end {
                                    decoder.sequence.result_len = i + 1;
                                } else {
                                    tracing::debug!(decoder = j, "failed (result_len = 0)");
                                    decoder.failed = true;
                                    continue;
                                }
                            }
                            if params.single_segment || params.no_timestamps {
                                decoder.sequence.result_len = i + 1;
                                decoder.seek_delta = 100 * CHUNK_SIZE as i32;
                            }
                            decoder.completed = true;
                            continue;
                        }
                    }

                    // repetition-loop mitigation
                    if i == n_max - 1
                        && (decoder.sequence.result_len == 0 || decoder.seek_delta < 100 * CHUNK_SIZE as i32 / 2)
                    {
                        tracing::debug!(decoder = j, "failed due to repetition loop");
                        decoder.failed = true;
                        continue;
                    }
                }

                // all done?
                let all_finished = (0..n_decoders_cur).all(|j| state.decoders[j].completed || state.decoders[j].failed);
                state.t_sample_us += t_sample.elapsed().as_micros();
                if all_finished {
                    break;
                }

                // next-token batch across the active decoders
                {
                    if let Some(should_abort) = callbacks.should_abort.as_mut() {
                        if should_abort() {
                            return Err(Error::Aborted);
                        }
                    }
                    let n_past = prompt.len() + i;
                    state.batch.clear();
                    for j in 0..n_decoders_cur {
                        let decoder = &mut state.decoders[j];
                        if decoder.failed || decoder.completed {
                            continue;
                        }
                        decoder.i_batch = state.batch.len();
                        state.batch.push(
                            decoder.sequence.tokens.last().unwrap().id,
                            n_past as i32,
                            j as i32,
                            true,
                        );
                    }
                    debug_assert!(state.batch.len() > 0);
                    let batch = std::mem::take(&mut state.batch);
                    decode(model, state, rt, &batch, params.n_threads)?;
                    state.batch = batch;

                    let t0 = std::time::Instant::now();
                    let logits = std::mem::take(&mut state.logits);
                    for j in 0..n_decoders_cur {
                        if state.decoders[j].failed || state.decoders[j].completed {
                            continue;
                        }
                        process_logits(model, &logits, &mut state.decoders[j], &params, t_cur);
                    }
                    state.logits = logits;
                    state.t_sample_us += t0.elapsed().as_micros();
                }
            }

            // rank the sequences
            {
                let mut best_score = f64::NEG_INFINITY;
                for j in 0..n_decoders_cur {
                    let decoder = &mut state.decoders[j];
                    if decoder.failed {
                        continue;
                    }
                    let result_len = decoder.sequence.result_len;
                    decoder.sequence.tokens.truncate(result_len);
                    sequence_score(&params, &mut decoder.sequence);
                    tracing::debug!(
                        decoder = j,
                        score = decoder.sequence.score,
                        result_len,
                        avg_logprobs = decoder.sequence.avg_logprobs,
                        entropy = decoder.sequence.entropy,
                        "sequence ranked"
                    );

                    if decoder.sequence.result_len > 32 && decoder.sequence.entropy < f64::from(params.entropy_thold) {
                        tracing::debug!(decoder = j, "failed due to low entropy");
                        decoder.failed = true;
                        continue;
                    }
                    if best_score < decoder.sequence.score {
                        best_score = decoder.sequence.score;
                        best_decoder_id = j;
                    }
                }
            }

            // temperature fallback?
            let mut success = true;
            if it != temperatures.len() - 1 {
                let decoder = &state.decoders[best_decoder_id];
                if decoder.failed
                    || (decoder.sequence.avg_logprobs < f64::from(params.logprob_thold)
                        && state.no_speech_prob < params.no_speech_thold)
                {
                    tracing::debug!(temperature = t_cur, "decoding failed, trying next temperature");
                    success = false;
                }
            }
            if success {
                break;
            }
        }

        // emit the results for this window
        let n_results_before = result_all.len();
        {
            let best_decoder = &state.decoders[best_decoder_id];
            let mut seek_delta = best_decoder.seek_delta;
            let result_len = best_decoder.sequence.result_len;
            let tokens_cur = best_decoder.sequence.tokens.clone();

            let is_no_speech = state.no_speech_prob > params.no_speech_thold
                && best_decoder.sequence.avg_logprobs < f64::from(params.logprob_thold);

            // update rolling context
            let past1_from_prompt: Vec<i32> = if !params.carry_initial_prompt
                && !prompt.is_empty()
                && prompt[0] == model.vocab.token_prev
            {
                prompt[1..prompt.len() - prompt_init.len()].to_vec()
            } else {
                Vec::new()
            };
            state.prompt_past1 = past1_from_prompt;
            if !is_no_speech {
                for token in &tokens_cur[..result_len] {
                    state.prompt_past1.push(token.id);
                }
            }

            if !tokens_cur.is_empty() && !is_no_speech {
                let mut i0 = 0usize;
                let mut t0 = i64::from(seek) + 2 * i64::from(tokens_cur[0].tid - model.vocab.token_beg);

                let mut text: Vec<u8> = Vec::new();
                let mut speaker_turn_next = false;

                let mut i = 0usize;
                while i < tokens_cur.len() {
                    let token = &tokens_cur[i];
                    if params.print_special || token.id < model.vocab.token_eot {
                        text.extend_from_slice(model.vocab.token_bytes(token.id));
                    }

                    if params.tdrz_enable && token.id == model.vocab.token_solm {
                        speaker_turn_next = true;
                    }

                    if token.id > model.vocab.token_beg && !params.single_segment {
                        let t1 = i64::from(seek) + 2 * i64::from(token.tid - model.vocab.token_beg);
                        if !text.is_empty() {
                            let segment_text = String::from_utf8_lossy(&text).into_owned();
                            tracing::info!(t0, t1, text = %segment_text, "segment");
                            result_all.push(FullSegment {
                                t0,
                                t1,
                                text: segment_text,
                                no_speech_prob: state.no_speech_prob,
                                tokens: tokens_cur[i0..=i].to_vec(),
                                speaker_turn_next,
                            });
                            if params.token_timestamps {
                                let mut ts = TimestampState {
                                    t_beg: state.t_beg,
                                    t_last: state.t_last,
                                    tid_last: state.tid_last,
                                };
                                compute_token_level_timestamps(
                                    &model.vocab,
                                    &state.energy,
                                    &mut ts,
                                    result_all.last_mut().unwrap(),
                                    params.thold_pt,
                                    params.thold_ptsum,
                                );
                                state.t_beg = ts.t_beg;
                                state.t_last = ts.t_last;
                                state.tid_last = ts.tid_last;
                                if params.max_len > 0 {
                                    wrap_segment(&model.vocab, &mut result_all, params.max_len, params.split_on_word);
                                }
                            }
                        }
                        text.clear();
                        let mut t_next = t1;
                        while i + 1 < tokens_cur.len() && tokens_cur[i + 1].id > model.vocab.token_beg {
                            i += 1;
                            if params.print_special {
                                text.extend_from_slice(model.vocab.token_bytes(tokens_cur[i].id));
                            }
                            t_next = i64::from(seek) + 2 * i64::from(tokens_cur[i].tid - model.vocab.token_beg);
                        }
                        t0 = t_next;
                        i0 = i + 1;
                        speaker_turn_next = false;
                    }
                    i += 1;
                }

                if !text.is_empty() {
                    let t1 = i64::from(seek + seek_delta);
                    let segment_text = String::from_utf8_lossy(&text).into_owned();
                    tracing::info!(t0, t1, text = %segment_text, "segment");
                    result_all.push(FullSegment {
                        t0,
                        t1,
                        text: segment_text,
                        no_speech_prob: state.no_speech_prob,
                        tokens: tokens_cur[i0..].to_vec(),
                        speaker_turn_next,
                    });
                    if params.token_timestamps {
                        let mut ts = TimestampState {
                            t_beg: state.t_beg,
                            t_last: state.t_last,
                            tid_last: state.tid_last,
                        };
                        compute_token_level_timestamps(
                            &model.vocab,
                            &state.energy,
                            &mut ts,
                            result_all.last_mut().unwrap(),
                            params.thold_pt,
                            params.thold_ptsum,
                        );
                        state.t_beg = ts.t_beg;
                        state.t_last = ts.t_last;
                        state.tid_last = ts.tid_last;
                        if params.max_len > 0 {
                            wrap_segment(&model.vocab, &mut result_all, params.max_len, params.split_on_word);
                        }
                    }
                }
            }

            // ref: whisper.cpp PR 2629
            let max_tokens_timestamp_ending =
                params.max_tokens > 0 && !params.single_segment && tokens_cur.len() > params.max_tokens as usize;
            let single_timestamp_ending = tokens_cur.len() > 1
                && !max_tokens_timestamp_ending
                && tokens_cur[tokens_cur.len() - 2].id < model.vocab.token_beg
                && tokens_cur[tokens_cur.len() - 1].id > model.vocab.token_beg;
            if single_timestamp_ending {
                tracing::debug!("single timestamp ending - skip entire chunk");
                seek_delta = (seek_end - seek).min(CHUNK_SIZE as i32 * 100);
            }

            seek += seek_delta;
            tracing::debug!(seek, seek_delta, "window advanced");
        }

        if let Some(on_new_segment) = callbacks.on_new_segment.as_mut() {
            for segment in &result_all[n_results_before..] {
                on_new_segment(segment);
            }
        }
    }

    if let Some(on_progress) = callbacks.on_progress.as_mut() {
        on_progress(100);
    }

    tracing::info!(
        segments = result_all.len(),
        mel_ms = state.t_mel_us / 1000,
        encode_ms = state.t_encode_us / 1000,
        decode_ms = state.t_decode_us / 1000,
        sample_ms = state.t_sample_us / 1000,
        n_encode = state.n_encode,
        n_decode = state.n_decode,
        total_ms = t_full.elapsed().as_millis() as u64,
        "transcription finished"
    );

    Ok(result_all)
}
