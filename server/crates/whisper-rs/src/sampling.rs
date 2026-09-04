//! Per-step token machinery, ported from whisper.cpp: logit filtering
//! (`whisper_process_logits`), probability computation, greedy and top-k
//! sampling (`whisper_sample_token*`) and sequence scoring
//! (`whisper_sequence_score`).

use crate::lang;
use crate::mel::CHUNK_SIZE;
use crate::model::Model;
use crate::state::{DecoderState, Sequence};
use crate::vocab::Vocab;
use crate::{FullParams, TokenData};

const NON_SPEECH_TOKENS: &[&str] = &[
    "\"", "#", "(", ")", "*", "+", "/", ":", ";", "<", "=", ">", "@", "[", "\\", "]", "^", "_", "`", "{", "|", "}",
    "~", "「", "」", "『", "』", "<<", ">>", "<<<", ">>>", "--", "---", "-(", "-[", "('", "(\"", "((", "))", "(((",
    ")))", "[[", "]]", "{{", "}}", "♪♪", "♪♪♪", "♩", "♪", "♫", "♬", "♭", "♮", "♯",
];

/// `whisper_compute_logprobs`. Note the C++ takes the max over the WHOLE
/// logits buffer (which can be longer than `n_logits`) — replicated on
/// purpose for parity.
pub(crate) fn compute_logprobs(logits: &[f32], n_logits: usize, logprobs: &mut Vec<f32>) {
    let logit_max = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let mut logsumexp = 0.0f32;
    for &l in &logits[..n_logits] {
        if l > f32::NEG_INFINITY {
            logsumexp += (l - logit_max).exp();
        }
    }
    let logsumexp = logsumexp.ln() + logit_max;

    logprobs.resize(n_logits, 0.0);
    for i in 0..n_logits {
        if logits[i] > f32::NEG_INFINITY {
            logprobs[i] = logits[i] - logsumexp;
        } else {
            logprobs[i] = f32::NEG_INFINITY;
        }
    }
}

pub(crate) fn compute_probs(logits: &[f32], n_logits: usize, logprobs: &[f32], probs: &mut Vec<f32>) {
    probs.resize(n_logits, 0.0);
    for i in 0..n_logits {
        if logits[i] == f32::NEG_INFINITY {
            probs[i] = 0.0;
        } else {
            probs[i] = logprobs[i].exp();
        }
    }
}

/// Port of `whisper_process_logits` (no grammar, no logit-filter callback).
pub(crate) fn process_logits(
    model: &Model,
    state_logits: &[f32],
    decoder: &mut DecoderState,
    params: &FullParams,
    temperature: f32,
) {
    let vocab = &model.vocab;
    let n_logits = vocab.n_vocab as usize;
    let is_initial = decoder.sequence.tokens.is_empty();

    decoder.logits.clear();
    decoder
        .logits
        .extend_from_slice(&state_logits[decoder.i_batch * n_logits..(decoder.i_batch + 1) * n_logits]);
    if temperature > 0.0 {
        for l in &mut decoder.logits {
            *l /= temperature;
        }
    }

    let logits = &mut decoder.logits;
    let token_beg = vocab.token_beg as usize;
    let token_eot = vocab.token_eot as usize;

    // suppress blank
    if params.suppress_blank && is_initial {
        logits[token_eot] = f32::NEG_INFINITY;
        if let Some(space) = vocab.id_for(" ") {
            logits[space as usize] = f32::NEG_INFINITY;
        }
    }

    // suppress <|notimestamps|>
    logits[vocab.token_not as usize] = f32::NEG_INFINITY;
    if params.no_timestamps {
        for l in &mut logits[token_beg..] {
            *l = f32::NEG_INFINITY;
        }
    }

    if !params.no_timestamps
        && !params.single_segment
        && params.max_tokens > 0
        && decoder.sequence.tokens.len() >= params.max_tokens as usize
    {
        for l in &mut logits[..token_eot] {
            *l = f32::NEG_INFINITY;
        }
    }

    // suppress sot / nosp
    logits[vocab.token_sot as usize] = f32::NEG_INFINITY;
    logits[vocab.token_nosp as usize] = f32::NEG_INFINITY;

    if !params.tdrz_enable {
        logits[vocab.token_solm as usize] = f32::NEG_INFINITY;
    }

    // suppress task tokens
    logits[vocab.token_translate as usize] = f32::NEG_INFINITY;
    logits[vocab.token_transcribe as usize] = f32::NEG_INFINITY;
    logits[vocab.token_prev as usize] = f32::NEG_INFINITY;

    // suppress lang tokens
    for id in 0..lang::LANGUAGES.len() {
        logits[vocab.token_lang(id) as usize] = f32::NEG_INFINITY;
    }

    // suppress non-speech tokens
    if params.suppress_nst {
        for token in NON_SPEECH_TOKENS {
            for candidate in [token.to_string(), format!(" {token}")] {
                if let Some(id) = vocab.id_for(&candidate) {
                    logits[id as usize] = f32::NEG_INFINITY;
                }
            }
        }
        if let Some(id) = vocab.id_for(" -") {
            logits[id as usize] = f32::NEG_INFINITY;
        }
        if let Some(id) = vocab.id_for(" '") {
            logits[id as usize] = f32::NEG_INFINITY;
        }
    }

    // timestamps appear in pairs, except directly before EOT
    {
        let tokens = &decoder.sequence.tokens;
        let last_was_timestamp = tokens.last().is_some_and(|t| t.id >= vocab.token_beg);
        let penultimate_was_timestamp = tokens.len() < 2 || tokens[tokens.len() - 2].id >= vocab.token_beg;
        if last_was_timestamp {
            if penultimate_was_timestamp {
                for l in &mut logits[token_beg..] {
                    *l = f32::NEG_INFINITY;
                }
            } else {
                for l in &mut logits[..token_eot] {
                    *l = f32::NEG_INFINITY;
                }
            }
        }
    }

    // initial timestamp cap
    if is_initial && params.max_initial_ts > 0.0 {
        let precision = CHUNK_SIZE as f32 / model.hparams.n_audio_ctx as f32;
        let tid0 = (params.max_initial_ts / precision).round() as usize;
        for l in logits.iter_mut().skip(token_beg + tid0 + 1) {
            *l = f32::NEG_INFINITY;
        }
    }

    // timestamps must be increasing
    if decoder.has_ts {
        let tid0 = (decoder.seek_delta / 2) as usize;
        for l in &mut logits[token_beg..(token_beg + tid0).min(n_logits)] {
            *l = f32::NEG_INFINITY;
        }
    }

    compute_logprobs(&decoder.logits, n_logits, &mut decoder.logprobs);

    // if the summed timestamp probability beats every text token, force a
    // timestamp sample
    {
        let logprobs = &decoder.logprobs;
        let mut timestamp_logprob = f32::NEG_INFINITY;
        {
            let logprob_max = logprobs[token_beg..].iter().copied().fold(f32::NEG_INFINITY, f32::max);
            let mut logsumexp = 0.0f32;
            for &lp in &logprobs[token_beg..] {
                if lp > f32::NEG_INFINITY {
                    logsumexp += (lp - logprob_max).exp();
                }
            }
            if logsumexp > 0.0 {
                timestamp_logprob = logsumexp.ln() + logprob_max;
            }
        }
        let max_text_token_logprob = logprobs[..token_beg].iter().copied().fold(f32::NEG_INFINITY, f32::max);
        if timestamp_logprob > max_text_token_logprob {
            for i in 0..token_beg {
                decoder.logits[i] = f32::NEG_INFINITY;
                decoder.logprobs[i] = f32::NEG_INFINITY;
            }
        }
    }

    let logprobs = std::mem::take(&mut decoder.logprobs);
    compute_probs(&decoder.logits, n_logits, &logprobs, &mut decoder.probs);
    decoder.logprobs = logprobs;
}

/// `whisper_sample_token`.
pub(crate) fn sample_token(vocab: &Vocab, decoder: &mut DecoderState, best: bool) -> TokenData {
    let mut result = TokenData::empty();
    result.tid = 0;
    let n_logits = vocab.n_vocab as usize;
    let token_beg = vocab.token_beg as usize;

    {
        let mut sum_ts = 0.0f64;
        let mut max_ts = 0.0f64;
        for i in token_beg..n_logits {
            let p = decoder.probs[i];
            if p == f32::NEG_INFINITY {
                continue;
            }
            sum_ts += f64::from(p);
            if max_ts < f64::from(p) {
                max_ts = f64::from(p);
                result.tid = i as i32;
            }
        }
        result.pt = (max_ts / (sum_ts + 1e-10)) as f32;
        result.ptsum = sum_ts as f32;
    }

    if best {
        for i in 0..n_logits {
            if result.p < decoder.probs[i] {
                result.id = i as i32;
                result.p = decoder.probs[i];
                result.plog = decoder.logprobs[i];
            }
        }
    } else {
        let id = decoder.rng.sample_weighted(&decoder.probs);
        result.id = id as i32;
        result.p = decoder.probs[id];
        result.plog = decoder.logprobs[id];
    }

    if result.id >= vocab.token_beg {
        result.tid = result.id;
        result.pt = result.p;
    }
    result
}

/// `whisper_sample_token_topk` — despite the name, the pinned whisper.cpp
/// draws k samples from the full distribution.
pub(crate) fn sample_token_topk(vocab: &Vocab, decoder: &mut DecoderState, k: usize) -> Vec<TokenData> {
    let n_logits = vocab.n_vocab as usize;
    let token_beg = vocab.token_beg as usize;

    let mut tid = vocab.token_beg;
    let pt;
    let ptsum;
    {
        let mut sum_ts = 0.0f64;
        let mut max_ts = 0.0f64;
        for i in token_beg..n_logits {
            let p = decoder.probs[i];
            if p == f32::NEG_INFINITY {
                continue;
            }
            sum_ts += f64::from(p);
            if max_ts < f64::from(p) {
                max_ts = f64::from(p);
                tid = i as i32;
            }
        }
        pt = (max_ts / (sum_ts + 1e-10)) as f32;
        ptsum = sum_ts as f32;
    }

    let mut result = Vec::with_capacity(k);
    for _ in 0..k {
        let id = decoder.rng.sample_weighted(&decoder.probs);
        let mut token = TokenData::empty();
        token.id = id as i32;
        token.tid = tid;
        token.p = decoder.probs[id];
        token.plog = decoder.logprobs[id];
        token.pt = pt;
        token.ptsum = ptsum;
        if token.id >= vocab.token_beg {
            token.tid = token.id;
            token.pt = token.p;
        }
        result.push(token);
    }
    result
}

/// `whisper_sequence_score`.
pub(crate) fn sequence_score(params: &FullParams, sequence: &mut Sequence) {
    if sequence.result_len == 0 {
        return;
    }
    let mut result = 0.0f64;
    for token in &sequence.tokens[..sequence.result_len] {
        result += f64::from(token.plog);
    }
    sequence.sum_logprobs = result;
    sequence.avg_logprobs = result / sequence.result_len as f64;

    let mut penalty = sequence.result_len as f64;
    if params.length_penalty > 0.0 {
        penalty = ((5.0 + penalty) / 6.0).powf(f64::from(params.length_penalty));
    }
    sequence.score = result / penalty;

    // entropy of the last 32 tokens
    {
        let n = 32usize;
        let start = sequence.result_len.saturating_sub(n);
        let mut counts = std::collections::BTreeMap::<i32, usize>::new();
        let mut cnt = 0usize;
        for token in &sequence.tokens[start..sequence.result_len] {
            *counts.entry(token.id).or_insert(0) += 1;
            cnt += 1;
        }
        let mut entropy = 0.0f64;
        for &c in counts.values() {
            let p = c as f64 / cnt as f64;
            entropy -= p * p.ln();
        }
        sequence.entropy = entropy;
    }
}

pub(crate) fn sequence_tokens_equal(a: &Sequence, b: &Sequence) -> bool {
    a.tokens.len() == b.tokens.len() && a.tokens.iter().zip(&b.tokens).rev().all(|(x, y)| x.id == y.id)
}

