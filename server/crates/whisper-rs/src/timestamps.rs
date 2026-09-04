//! Heuristic token-level timestamps, ported from
//! `whisper_exp_compute_token_level_timestamps`, plus `get_signal_energy`,
//! `voice_length` and `whisper_wrap_segment`.

use crate::mel::SAMPLE_RATE;
use crate::vocab::Vocab;
use crate::FullSegment;

/// `get_signal_energy`: moving average of |signal|.
pub(crate) fn signal_energy(signal: &[f32], half_window: i32) -> Vec<f32> {
    let n = signal.len() as i32;
    let hw = half_window;
    let mut result = vec![0.0f32; signal.len()];
    for i in 0..n {
        let mut sum = 0.0f32;
        for j in -hw..=hw {
            if i + j >= 0 && i + j < n {
                sum += signal[(i + j) as usize].abs();
            }
        }
        result[i as usize] = sum / (2 * hw + 1) as f32;
    }
    result
}

/// `voice_length`: hand-tuned per-character speaking-time weight.
pub(crate) fn voice_length(text: &str) -> f32 {
    let mut res = 0.0f32;
    for cp in text.chars() {
        match cp {
            ' ' | '\u{3000}' => res += 0.01,
            ',' | '\u{FF0C}' | '\u{3001}' | '\u{FF1B}' | '\u{FF1A}' => res += 2.0,
            '.' | '!' | '?' | '\u{3002}' | '\u{FF0E}' | '\u{FF01}' | '\u{FF1F}' | '\u{2026}' => res += 3.0,
            c if c.is_ascii_digit() || ('\u{FF10}'..='\u{FF19}').contains(&c) => res += 3.0,
            _ => res += 1.0,
        }
    }
    res
}

fn timestamp_to_sample(t: i64, segment_t0: i64, n_samples: usize) -> usize {
    let relative = t - segment_t0;
    let sample = (relative * SAMPLE_RATE as i64) / 100;
    sample.clamp(0, n_samples as i64 - 1) as usize
}

fn sample_to_timestamp(i_sample: usize, segment_t0: i64) -> i64 {
    (100 * i_sample as i64) / SAMPLE_RATE as i64 + segment_t0
}

pub(crate) struct TimestampState {
    pub t_beg: i64,
    pub t_last: i64,
    pub tid_last: i32,
}

/// Port of `whisper_exp_compute_token_level_timestamps` for one segment.
#[allow(clippy::needless_range_loop)]
pub(crate) fn compute_token_level_timestamps(
    vocab: &Vocab,
    energy: &[f32],
    ts: &mut TimestampState,
    segment: &mut FullSegment,
    thold_pt: f32,
    thold_ptsum: f32,
) {
    let n_samples = energy.len();
    if n_samples == 0 {
        tracing::error!("no signal data available for token timestamps");
        return;
    }

    let t0 = segment.t0;
    let t1 = segment.t1;
    let n = segment.tokens.len();
    if n == 0 {
        return;
    }
    if n == 1 {
        segment.tokens[0].t0 = t0;
        segment.tokens[0].t1 = t1;
        return;
    }

    let tokens = &mut segment.tokens;

    for j in 0..n {
        if j == 0 {
            if tokens[j].id == vocab.token_beg {
                tokens[0].t0 = t0;
                tokens[0].t1 = t0;
                tokens[1].t0 = t0;
                ts.t_beg = t0;
                ts.t_last = t0;
                ts.tid_last = vocab.token_beg;
            } else {
                tokens[0].t0 = ts.t_last;
            }
        }

        let tt = ts.t_beg + 2 * i64::from(tokens[j].tid - vocab.token_beg);

        tokens[j].vlen = voice_length(&vocab.token_str(tokens[j].id));

        if tokens[j].pt > thold_pt && tokens[j].ptsum > thold_ptsum && tokens[j].tid > ts.tid_last && tt <= t1 {
            if j > 0 {
                tokens[j - 1].t1 = tt;
            }
            tokens[j].t0 = tt;
            ts.tid_last = tokens[j].tid;
        }
    }

    tokens[n - 2].t1 = t1;
    tokens[n - 1].t0 = t1;
    tokens[n - 1].t1 = t1;
    ts.t_last = t1;

    // fill unknown timestamps proportionally to the voice lengths
    {
        let mut p0 = 0usize;
        let mut p1 = 0usize;
        loop {
            while p1 < n && tokens[p1].t1 < 0 {
                p1 += 1;
            }
            if p1 >= n {
                p1 = n - 1;
            }
            if p1 > p0 {
                let mut psum = 0.0f64;
                for j in p0..=p1 {
                    psum += f64::from(tokens[j].vlen);
                }
                let dt = (tokens[p1].t1 - tokens[p0].t0) as f64;
                for j in p0 + 1..=p1 {
                    let ct = tokens[j - 1].t0 as f64 + dt * f64::from(tokens[j - 1].vlen) / psum;
                    tokens[j - 1].t1 = ct as i64;
                    tokens[j].t0 = ct as i64;
                }
            }
            p1 += 1;
            p0 = p1;
            if p1 >= n {
                break;
            }
        }
    }

    // fix up overlaps
    for j in 0..n - 1 {
        if tokens[j].t1 < 0 {
            tokens[j + 1].t0 = tokens[j].t1;
        }
        if j > 0 && tokens[j - 1].t1 > tokens[j].t0 {
            tokens[j].t0 = tokens[j - 1].t1;
            tokens[j].t1 = tokens[j].t0.max(tokens[j].t1);
        }
    }

    // expand or contract to voice activity
    {
        let hw = SAMPLE_RATE / 8;
        for j in 0..n {
            if tokens[j].id >= vocab.token_eot {
                continue;
            }
            let mut s0 = timestamp_to_sample(tokens[j].t0, segment.t0, n_samples);
            let mut s1 = timestamp_to_sample(tokens[j].t1, segment.t0, n_samples);
            let ss0 = s0.saturating_sub(hw);
            let ss1 = (s1 + hw).min(n_samples);
            let ns = ss1 - ss0;
            let mut sum = 0.0f32;
            for k in ss0..ss1 {
                sum += energy[k];
            }
            let thold = 0.5 * sum / ns as f32;

            {
                let mut k = s0;
                if energy[k] > thold && j > 0 {
                    while k > 0 && energy[k] > thold {
                        k -= 1;
                    }
                    tokens[j].t0 = sample_to_timestamp(k, segment.t0);
                    if tokens[j].t0 < tokens[j - 1].t1 {
                        tokens[j].t0 = tokens[j - 1].t1;
                    } else {
                        s0 = k;
                    }
                } else {
                    while energy[k] < thold && k < s1 {
                        k += 1;
                    }
                    s0 = k;
                    tokens[j].t0 = sample_to_timestamp(k, segment.t0);
                }
            }

            {
                let mut k = s1;
                if energy[k] > thold {
                    while k < n_samples - 1 && energy[k] > thold {
                        k += 1;
                    }
                    tokens[j].t1 = sample_to_timestamp(k, segment.t0);
                    if j < n - 1 && tokens[j].t1 > tokens[j + 1].t0 {
                        tokens[j].t1 = tokens[j + 1].t0;
                    } else {
                        s1 = k;
                    }
                } else {
                    while energy[k] < thold && k > s0 {
                        k -= 1;
                    }
                    let _ = s1;
                    tokens[j].t1 = sample_to_timestamp(k, segment.t0);
                }
            }
        }
    }
}

fn utf8_len(text: &str) -> usize {
    text.chars().count()
}

fn should_split_on_word(text: &str, split_on_word: bool) -> bool {
    !split_on_word || text.starts_with(' ')
}

/// Port of `whisper_wrap_segment`: wrap the last segment in `result` to
/// `max_len` characters. Returns the number of segments it became.
pub(crate) fn wrap_segment(vocab: &Vocab, result: &mut Vec<FullSegment>, max_len: i32, split_on_word: bool) -> usize {
    let mut segment = result.last().cloned().expect("wrap_segment on empty result");
    let mut res = 1usize;
    let mut acc = 0i32;
    let mut text = String::new();

    let mut i = 0usize;
    while i < segment.tokens.len() {
        let token = segment.tokens[i].clone();
        if token.id >= vocab.token_eot {
            i += 1;
            continue;
        }
        let txt = vocab.token_str(token.id);
        let cur = utf8_len(&txt) as i32;

        if acc + cur > max_len && i > 0 && should_split_on_word(&txt, split_on_word) {
            {
                let last = result.last_mut().unwrap();
                last.text = std::mem::take(&mut text);
                last.t1 = token.t0;
                last.tokens.truncate(i);
                last.speaker_turn_next = false;
            }
            let mut new_segment = FullSegment {
                t0: token.t0,
                t1: segment.t1,
                text: String::new(),
                no_speech_prob: segment.no_speech_prob,
                tokens: segment.tokens[i..].to_vec(),
                speaker_turn_next: segment.speaker_turn_next,
            };
            // Match the C++: `segment = state.result_all.back()` then `i = -1`.
            new_segment.no_speech_prob = segment.no_speech_prob;
            result.push(new_segment.clone());
            acc = 0;
            segment = new_segment;
            i = 0;
            res += 1;
            continue;
        }

        acc += cur;
        text.push_str(&txt);
        i += 1;
    }

    result.last_mut().unwrap().text = text;
    res
}
