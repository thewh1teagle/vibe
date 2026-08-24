//! The Sortformer mel frontend: preemphasis, STFT, mel filterbank, log.
//!
//! Ported unchanged (bar the filterbank injection described below) from
//! `parakeet-rs 0.3.x` `src/sortformer.rs` and `src/audio.rs`, MIT OR
//! Apache-2.0, Copyright (c) 2025 Enes Altun. The STFT itself follows
//! <https://librosa.org/doc/main/generated/librosa.stft.html>; the NeMo side is
//! `AudioToMelSpectrogramPreprocessor` with `normalize="NA"`, `mag_power=2.0`,
//! `preemph=0.97`, `log_zero_guard_value=2**-24`.
//!
//! Note this frontend is *not* the one in `crates/parakeet-rs/src/mel.rs`:
//! Parakeet normalizes per-feature, Sortformer does not normalize at all.

use std::f32::consts::PI;

use ndarray::{Array2, Array3, Axis};
use realfft::RealFftPlanner;

use super::{HostError, HostResult, FREQ_BINS, HOP_LENGTH, LOG_ZERO_GUARD, N_FFT, N_MELS, PREEMPH, SAMPLE_RATE, WIN_LENGTH};

// Slaney mel scale constants (librosa `htk=False`).
const F_SP: f64 = 200.0 / 3.0;
const MIN_LOG_HZ: f64 = 1000.0;
const MIN_LOG_MEL: f64 = MIN_LOG_HZ / F_SP;
const LOG_STEP: f64 = 0.068_751_777_420_949_12;

/// The mel frontend, holding the filterbank it multiplies the power spectrum by.
///
/// The filterbank is the one thing here that the checkpoint gets a say in. The
/// Sortformer GGUF ships the **trained** filterbank as a tensor named
/// `preprocessor.fb` with ggml shape `[257, 128]` — i.e. 128 contiguous rows of
/// 257 floats, exactly the `[n_mels, freq_bins]` layout used here. Prefer it
/// via [`MelFrontend::from_trained_filterbank`]: NeMo builds the bank with
/// torchaudio, whose triangle edges and Slaney normalisation differ from
/// librosa's in the last few ulps, and those differences propagate through the
/// log. [`MelFrontend::computed`] recreates librosa's bank as a fallback for
/// when no such tensor is available (e.g. an older export); it is close, not
/// identical.
pub struct MelFrontend {
    /// `[n_mels, freq_bins]`.
    basis: Array2<f32>,
}

impl MelFrontend {
    /// Build the librosa/Slaney filterbank from first principles.
    ///
    /// Fallback only — see the type docs for why the GGUF tensor is preferred.
    pub fn computed() -> Self {
        Self {
            basis: create_mel_filterbank(N_FFT, N_MELS, SAMPLE_RATE),
        }
    }

    /// Adopt the filterbank shipped in the checkpoint.
    ///
    /// `data` is the raw `preprocessor.fb` buffer, ggml `ne = [257, 128]`,
    /// which in memory is `[N_MELS][FREQ_BINS]` row-major.
    pub fn from_trained_filterbank(data: &[f32]) -> HostResult<Self> {
        if data.len() != N_MELS * FREQ_BINS {
            return Err(HostError::Audio(format!(
                "mel filterbank has {} values, expected {}",
                data.len(),
                N_MELS * FREQ_BINS
            )));
        }
        let basis = Array2::from_shape_vec((N_MELS, FREQ_BINS), data.to_vec())
            .map_err(|e| HostError::Audio(format!("mel filterbank reshape failed: {e}")))?;
        Ok(Self { basis })
    }

    /// Full frontend: raw 16 kHz mono samples in, log-mel `(1, T, N_MELS)` out.
    pub fn extract_mel_features(&self, audio: &[f32]) -> HostResult<Array3<f32>> {
        // 1. Dither. NeMo uses dither=1e-5, but random noise would make the
        //    output non-reproducible run to run, so it is deliberately NOT
        //    applied here. The log zero guard below already keeps log(0) away.

        // 2. Preemphasis (NeMo `preemph=0.97`).
        let preemphasized = apply_preemphasis(audio, PREEMPH);

        // 3. STFT -> power spectrum.
        let spectrogram = stft(&preemphasized)?;

        // 4. Mel filterbank (Slaney-normalised).
        let mel_spec = self.basis.dot(&spectrogram);

        // 5. Log with the guard value (NeMo `log_zero_guard_value = 2^-24`).
        //    NeMo's `normalize='NA'` means no normalization follows.
        let log_mel_spec = mel_spec.mapv(|x| (x + LOG_ZERO_GUARD).ln());

        // NeMo emits (B, D, T); the model wants (B, T, D).
        Ok(log_mel_spec.t().to_owned().insert_axis(Axis(0)))
    }
}

/// First-order preemphasis filter, `y[n] = x[n] - coef * x[n-1]`.
fn apply_preemphasis(audio: &[f32], coef: f32) -> Vec<f32> {
    if audio.is_empty() {
        return Vec::new();
    }

    let mut result = Vec::with_capacity(audio.len());
    result.push(audio[0]);

    for i in 1..audio.len() {
        result.push(audio[i] - coef * audio[i - 1]);
    }

    result
}

fn hann_window(window_length: usize) -> Vec<f32> {
    // Librosa uses a periodic window (fftbins=True): divide by N, not N-1.
    // The generic `audio.rs` helper in the upstream crate divides by N-1, which
    // is the symmetric window — do not substitute it here.
    (0..window_length)
        .map(|i| 0.5 - 0.5 * ((2.0 * PI * i as f32) / window_length as f32).cos())
        .collect()
}

/// Centered STFT returning the power spectrum, `[freq_bins, num_frames]`.
fn stft(audio: &[f32]) -> HostResult<Array2<f32>> {
    let mut planner = RealFftPlanner::<f32>::new();
    let r2c = planner.plan_fft_forward(N_FFT);

    // Hann window of length win_length, then zero-padded to n_fft (centered).
    // This is exactly what librosa does: util.pad_center(fft_window, size=n_fft).
    let hann = hann_window(WIN_LENGTH);
    let win_offset = (N_FFT - WIN_LENGTH) / 2;
    let mut fft_window = vec![0.0f32; N_FFT];
    fft_window[win_offset..(WIN_LENGTH + win_offset)].copy_from_slice(&hann[..WIN_LENGTH]);

    // Pad the signal for center=True (like librosa/torch.stft): n_fft // 2 each side.
    let pad_amount = N_FFT / 2;
    let mut padded_audio = vec![0.0; pad_amount];
    padded_audio.extend_from_slice(audio);
    padded_audio.extend(vec![0.0; pad_amount]);

    let num_frames = (padded_audio.len() - N_FFT) / HOP_LENGTH + 1;
    let freq_bins = FREQ_BINS;
    let mut spectrogram = Array2::<f32>::zeros((freq_bins, num_frames));

    let mut input = vec![0.0f32; N_FFT];
    let mut output = r2c.make_output_vec();
    let mut scratch = r2c.make_scratch_vec();

    for frame_idx in 0..num_frames {
        let start = frame_idx * HOP_LENGTH;

        // Extract n_fft samples and multiply by the zero-padded window.
        for i in 0..N_FFT {
            input[i] = if start + i < padded_audio.len() {
                padded_audio[start + i] * fft_window[i]
            } else {
                0.0
            };
        }

        r2c.process_with_scratch(&mut input, &mut output, &mut scratch)
            .map_err(|e| HostError::Audio(format!("FFT failed: {e}")))?;

        for k in 0..freq_bins {
            // Power spectrum (magnitude^2) — NeMo uses mag_power=2.0.
            spectrogram[[k, frame_idx]] = output[k].norm_sqr();
        }
    }

    Ok(spectrogram)
}

fn hz_to_mel_slaney(hz: f64) -> f64 {
    if hz < MIN_LOG_HZ {
        hz / F_SP
    } else {
        MIN_LOG_MEL + (hz / MIN_LOG_HZ).ln() / LOG_STEP
    }
}

fn mel_to_hz_slaney(mel: f64) -> f64 {
    if mel < MIN_LOG_MEL {
        mel * F_SP
    } else {
        MIN_LOG_HZ * ((mel - MIN_LOG_MEL) * LOG_STEP).exp()
    }
}

/// librosa's `mel(htk=False, norm="slaney")` filterbank, `[n_mels, freq_bins]`.
fn create_mel_filterbank(n_fft: usize, n_mels: usize, sample_rate: usize) -> Array2<f32> {
    let freq_bins = n_fft / 2 + 1;
    let mut filterbank = Array2::<f32>::zeros((n_mels, freq_bins));

    let fmax = sample_rate as f64 / 2.0;
    let mel_min = hz_to_mel_slaney(0.0);
    let mel_max = hz_to_mel_slaney(fmax);

    // Mel centre frequencies.
    let mel_points: Vec<f64> = (0..=n_mels + 1)
        .map(|i| mel_to_hz_slaney(mel_min + (mel_max - mel_min) * i as f64 / (n_mels + 1) as f64))
        .collect();

    // FFT bin frequencies.
    let fft_freqs: Vec<f64> = (0..freq_bins).map(|i| i as f64 * sample_rate as f64 / n_fft as f64).collect();

    // librosa's ramp.
    let fdiff: Vec<f64> = mel_points.windows(2).map(|w| w[1] - w[0]).collect();

    for i in 0..n_mels {
        for (k, &freq) in fft_freqs.iter().enumerate() {
            let lower = (freq - mel_points[i]) / fdiff[i];
            let upper = (mel_points[i + 2] - freq) / fdiff[i + 1];
            filterbank[[i, k]] = 0.0f64.max(lower.min(upper)) as f32;
        }
    }

    // Slaney norm.
    for i in 0..n_mels {
        let enorm = 2.0 / (mel_points[i + 2] - mel_points[i]);
        for k in 0..freq_bins {
            filterbank[[i, k]] *= enorm as f32;
        }
    }

    filterbank
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine_wave(freq_hz: f32, sample_rate: usize, num_samples: usize) -> Vec<f32> {
        (0..num_samples)
            .map(|i| (2.0 * PI * freq_hz * i as f32 / sample_rate as f32).sin())
            .collect()
    }

    #[test]
    fn stft_concentrates_power_at_expected_bin() {
        // 1kHz sine at 16kHz sample rate, 1 second
        let audio = sine_wave(1000.0, SAMPLE_RATE, SAMPLE_RATE);
        let spec = stft(&audio).unwrap();

        // Expected bin: 1000 * N_FFT / SAMPLE_RATE = 1000 * 512 / 16000 = 32
        let expected_bin = 32;
        let freq_bins = FREQ_BINS;
        let num_frames = spec.shape()[1];

        let mut correct_frames = 0;
        for frame in 2..num_frames.saturating_sub(2) {
            let mut max_bin = 0;
            let mut max_power = 0.0f32;
            for bin in 0..freq_bins {
                if spec[[bin, frame]] > max_power {
                    max_power = spec[[bin, frame]];
                    max_bin = bin;
                }
            }
            if max_bin == expected_bin {
                correct_frames += 1;
            }
        }

        let interior_frames = num_frames.saturating_sub(4);
        assert!(
            correct_frames > interior_frames / 2,
            "Expected bin {expected_bin} to dominate, but only {correct_frames}/{interior_frames}"
        );
    }

    #[test]
    fn stft_output_shape_is_correct() {
        let audio = vec![0.0f32; SAMPLE_RATE]; // 1 second
        let spec = stft(&audio).unwrap();

        assert_eq!(spec.shape()[0], FREQ_BINS);
        assert!(spec.shape()[1] > 0);
    }

    #[test]
    fn trained_filterbank_is_adopted_verbatim() {
        // The GGUF buffer is [N_MELS][FREQ_BINS] row-major; check a round trip
        // so a transposed export is caught here rather than as bad audio.
        let computed = create_mel_filterbank(N_FFT, N_MELS, SAMPLE_RATE);
        let flat: Vec<f32> = computed.iter().copied().collect();
        let frontend = MelFrontend::from_trained_filterbank(&flat).unwrap();
        assert_eq!(frontend.basis, computed);

        assert!(MelFrontend::from_trained_filterbank(&flat[..10]).is_err());
    }
}
