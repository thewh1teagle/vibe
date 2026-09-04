//! Log-mel spectrogram, ported bit-for-bit from whisper.cpp
//! (`log_mel_spectrogram` and its poor-man's Cooley-Tukey FFT with the
//! precomputed sin/cos table). The C++ splits frames across threads but every
//! frame is independent, so a sequential port produces identical output.

use crate::model::Filters;

pub const SAMPLE_RATE: usize = 16_000;
pub const N_FFT: usize = 400;
pub const HOP_LENGTH: usize = 160;
pub const CHUNK_SIZE: usize = 30;

const SIN_COS_N_COUNT: usize = N_FFT;

pub(crate) struct Mel {
    pub n_len: i32,
    pub n_len_org: i32,
    pub n_mel: i32,
    /// `[n_mel][n_len]` row-major.
    pub data: Vec<f32>,
}

struct Tables {
    sin_vals: [f32; SIN_COS_N_COUNT],
    cos_vals: [f32; SIN_COS_N_COUNT],
    hann: [f32; N_FFT],
}

fn tables() -> &'static Tables {
    use std::sync::OnceLock;
    static TABLES: OnceLock<Tables> = OnceLock::new();
    TABLES.get_or_init(|| {
        let mut t = Tables {
            sin_vals: [0.0; SIN_COS_N_COUNT],
            cos_vals: [0.0; SIN_COS_N_COUNT],
            hann: [0.0; N_FFT],
        };
        for i in 0..SIN_COS_N_COUNT {
            let theta = (2.0 * std::f64::consts::PI * i as f64) / SIN_COS_N_COUNT as f64;
            t.sin_vals[i] = (theta as f32).sin();
            t.cos_vals[i] = (theta as f32).cos();
        }
        // Periodic Hann window, computed with cosf like the C++ (the angle is
        // narrowed to f32 before the cosine, and the outer math is double).
        for (i, w) in t.hann.iter_mut().enumerate() {
            let c = (((2.0 * std::f64::consts::PI * i as f64) / N_FFT as f64) as f32).cos();
            *w = (0.5 * (1.0 - f64::from(c))) as f32;
        }
        t
    })
}

/// Naive DFT for odd sizes, identical to the C++ fallback.
fn dft(t: &Tables, input: &[f32], n: usize, out: &mut [f32]) {
    let sin_cos_step = SIN_COS_N_COUNT / n;
    for k in 0..n {
        let mut re = 0.0f32;
        let mut im = 0.0f32;
        for (idx_n, &x) in input.iter().enumerate().take(n) {
            let idx = (k * idx_n * sin_cos_step) % SIN_COS_N_COUNT;
            re = x.mul_add(t.cos_vals[idx], re);
            im = (-x).mul_add(t.sin_vals[idx], im);
        }
        out[k * 2] = re;
        out[k * 2 + 1] = im;
    }
}

/// Cooley-Tukey FFT, same arithmetic as the C++ (which recurses over an
/// in-place scratch layout; the operations and their order are identical).
/// `input` holds `n` real samples, `out` receives `2n` interleaved re/im.
fn fft(t: &Tables, input: &[f32], n: usize, out: &mut [f32]) {
    if n == 1 {
        out[0] = input[0];
        out[1] = 0.0;
        return;
    }
    let half_n = n / 2;
    if n - half_n * 2 == 1 {
        dft(t, input, n, out);
        return;
    }

    let even: Vec<f32> = (0..half_n).map(|i| input[2 * i]).collect();
    let odd: Vec<f32> = (0..half_n).map(|i| input[2 * i + 1]).collect();
    let mut even_fft = vec![0.0f32; 2 * half_n];
    let mut odd_fft = vec![0.0f32; 2 * half_n];
    fft(t, &even, half_n, &mut even_fft);
    fft(t, &odd, half_n, &mut odd_fft);

    let sin_cos_step = SIN_COS_N_COUNT / n;
    for k in 0..half_n {
        let idx = k * sin_cos_step;
        let re = t.cos_vals[idx];
        let im = -t.sin_vals[idx];
        let re_odd = odd_fft[2 * k];
        let im_odd = odd_fft[2 * k + 1];
        out[2 * k] = (-im).mul_add(im_odd, re.mul_add(re_odd, even_fft[2 * k]));
        out[2 * k + 1] = im.mul_add(re_odd, re.mul_add(im_odd, even_fft[2 * k + 1]));
        out[2 * (k + half_n)] = im.mul_add(im_odd, (-re).mul_add(re_odd, even_fft[2 * k]));
        out[2 * (k + half_n) + 1] = (-im).mul_add(re_odd, (-re).mul_add(im_odd, even_fft[2 * k + 1]));
    }
}

/// Port of `log_mel_spectrogram`.
#[allow(clippy::needless_range_loop)] // loop shapes mirror the C++ for parity
pub(crate) fn log_mel_spectrogram(samples: &[f32], filters: &Filters, n_mel: i32) -> Mel {
    let span = tracing::info_span!("mel");
    let _guard = span.enter();
    let start = std::time::Instant::now();

    let t = tables();
    let n_samples = samples.len();
    let frame_size = N_FFT;
    let frame_step = HOP_LENGTH;

    let stage_1_pad = SAMPLE_RATE * 30;
    let stage_2_pad = frame_size / 2;

    let mut padded = vec![0.0f32; n_samples + stage_1_pad + stage_2_pad * 2];
    padded[stage_2_pad..stage_2_pad + n_samples].copy_from_slice(samples);
    // Reflective pad at the beginning: reverse of samples[1..=stage_2_pad].
    for i in 0..stage_2_pad {
        let src = (stage_2_pad - i).min(n_samples.saturating_sub(1));
        padded[i] = samples.get(src).copied().unwrap_or(0.0);
    }

    let n_len = (padded.len() - frame_size) / frame_step;
    let n_len_org = 1 + (n_samples + stage_2_pad - frame_size) / frame_step;
    let n_fft = filters.n_fft as usize;

    let mut mel = Mel {
        n_len: n_len as i32,
        n_len_org: n_len_org as i32,
        n_mel,
        data: vec![0.0f32; n_mel as usize * n_len],
    };

    let effective_samples = n_samples + stage_2_pad;
    let n_frames_with_signal = (effective_samples / frame_step + 1).min(n_len);

    let mut fft_in = vec![0.0f32; frame_size * 2];
    let mut fft_out = vec![0.0f32; frame_size * 2 * 2 * 2];

    for i in 0..n_frames_with_signal {
        let offset = i * frame_step;
        let take = frame_size.min(effective_samples - offset);
        for j in 0..take {
            fft_in[j] = t.hann[j] * padded[offset + j];
        }
        // The C++ zero-fills only when the frame runs past the signal; the
        // padded buffer already carries zeros there, so mirror the fill.
        if take < frame_size {
            for v in fft_in.iter_mut().skip(take) {
                *v = 0.0;
            }
        }

        fft(t, &fft_in[..frame_size], frame_size, &mut fft_out);

        // The shipped clang build fuses the real square into the add:
        // out = fma(re, re, im*im).
        for j in 0..n_fft {
            fft_out[j] = fft_out[2 * j].mul_add(fft_out[2 * j], fft_out[2 * j + 1] * fft_out[2 * j + 1]);
        }

        for j in 0..n_mel as usize {
            // Match the C++ unrolled accumulation exactly: each group of four
            // products is summed in f32, then accumulated in f64.
            let mut sum = 0.0f64;
            let flt = &filters.data[j * n_fft..(j + 1) * n_fft];
            let mut k = 0usize;
            while k < n_fft - 3 {
                let partial = fft_out[k + 3].mul_add(
                    flt[k + 3],
                    fft_out[k + 2].mul_add(flt[k + 2], fft_out[k + 1].mul_add(flt[k + 1], fft_out[k] * flt[k])),
                );
                sum += f64::from(partial);
                k += 4;
            }
            while k < n_fft {
                sum += f64::from(fft_out[k] * flt[k]);
                k += 1;
            }
            let sum = sum.max(1e-10).log10();
            mel.data[j * n_len + i] = sum as f32;
        }
    }

    let silent = 1e-10f64.log10() as f32;
    for i in n_frames_with_signal..n_len {
        for j in 0..n_mel as usize {
            mel.data[j * n_len + i] = silent;
        }
    }

    // Clamping and normalization.
    let mut mmax = -1e20f64;
    for &v in &mel.data {
        if f64::from(v) > mmax {
            mmax = f64::from(v);
        }
    }
    mmax -= 8.0;
    for v in &mut mel.data {
        if f64::from(*v) < mmax {
            *v = mmax as f32;
        }
        *v = ((f64::from(*v) + 4.0) / 4.0) as f32;
    }

    tracing::info!(
        n_len,
        n_len_org,
        elapsed_ms = start.elapsed().as_millis() as u64,
        "mel spectrogram computed"
    );
    mel
}
