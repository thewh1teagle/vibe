//! Log-mel frontend of `NemotronAsrStreamingFeatureExtractor`, offline (`center=True`) form.
//!
//! Pre-emphasis, a zero-padded centered STFT with a symmetric Hann window,
//! power spectrum, Slaney mel filterbank, `ln(x + 2^-24)`. No normalization.
//! Frames past `floor(len / hop)` are invalid and zeroed, as the HF extractor does.

use std::f64::consts::PI;
use std::sync::Arc;
use std::time::Instant;

use rayon::prelude::*;
use rustfft::num_complex::Complex64;
use rustfft::{Fft, FftPlanner};

const LOG_ZERO_GUARD: f64 = 5.960_464_477_539_063e-8; // 2^-24

#[derive(Debug, Clone)]
pub struct MelConfig {
    pub sample_rate: usize,
    pub num_mels: usize,
    pub n_fft: usize,
    pub win_length: usize,
    pub hop_length: usize,
    pub preemphasis: f32,
}

/// Time-major `[num_frames, num_mels]` log-mel features.
pub struct MelFeatures {
    pub data: Vec<f32>,
    pub num_frames: usize,
    /// Frames before this index are real audio; the rest are zeroed padding.
    pub num_valid: usize,
}

pub struct MelFrontend {
    config: MelConfig,
    window: Vec<f64>,
    filterbank: Vec<f32>,
    fft: Arc<dyn Fft<f64>>,
}

impl MelFrontend {
    pub fn new(config: MelConfig) -> Self {
        let window = hann_symmetric_padded(config.win_length, config.n_fft);
        let filterbank = slaney_filterbank(&config);
        let fft = FftPlanner::<f64>::new().plan_fft_forward(config.n_fft);
        Self {
            config,
            window,
            filterbank,
            fft,
        }
    }

    pub fn compute(&self, pcm: &[f32]) -> MelFeatures {
        let started = Instant::now();
        let cfg = &self.config;
        let pad = cfg.n_fft / 2;
        let num_frames = pcm.len() / cfg.hop_length + 1;
        let num_valid = pcm.len() / cfg.hop_length;

        let mut padded = vec![0.0f64; pcm.len() + 2 * pad];
        if let Some(&first) = pcm.first() {
            padded[pad] = first as f64;
        }
        for i in 1..pcm.len() {
            padded[pad + i] = pcm[i] as f64 - cfg.preemphasis as f64 * pcm[i - 1] as f64;
        }

        let num_freq = cfg.n_fft / 2 + 1;
        let num_mels = cfg.num_mels;
        let mut data = vec![0.0f32; num_frames * num_mels];
        data.par_chunks_mut(num_mels).enumerate().take(num_valid).for_each_init(
            || (vec![Complex64::default(); cfg.n_fft], vec![0.0f64; num_freq]),
            |(frame, power), (t, out)| {
                let start = t * cfg.hop_length;
                for k in 0..cfg.n_fft {
                    frame[k] = Complex64::new(padded[start + k] * self.window[k], 0.0);
                }
                self.fft.process(frame);
                for k in 0..num_freq {
                    power[k] = frame[k].norm_sqr();
                }
                for (m, value) in out.iter_mut().enumerate() {
                    let row = &self.filterbank[m * num_freq..(m + 1) * num_freq];
                    let sum = row.iter().zip(power.iter()).map(|(&w, &p)| w as f64 * p).sum::<f64>();
                    *value = (sum + LOG_ZERO_GUARD).ln() as f32;
                }
            },
        );

        tracing::debug!(
            samples = pcm.len(),
            num_frames,
            num_valid,
            ms = started.elapsed().as_secs_f64() * 1e3,
            "mel features"
        );
        MelFeatures {
            data,
            num_frames,
            num_valid,
        }
    }
}

/// `torch.hann_window(win_length, periodic=False)` centered in an `n_fft` frame, as `torch.stft` pads it.
fn hann_symmetric_padded(win_length: usize, n_fft: usize) -> Vec<f64> {
    let mut window = vec![0.0; n_fft];
    let offset = (n_fft - win_length) / 2;
    for k in 0..win_length {
        window[offset + k] = 0.5 - 0.5 * (2.0 * PI * k as f64 / (win_length - 1) as f64).cos();
    }
    window
}

fn hz_to_mel(hz: f64) -> f64 {
    const FSP: f64 = 200.0 / 3.0;
    if hz < 1000.0 {
        hz / FSP
    } else {
        1000.0 / FSP + (hz / 1000.0).ln() / (6.4f64.ln() / 27.0)
    }
}

fn mel_to_hz(mel: f64) -> f64 {
    const FSP: f64 = 200.0 / 3.0;
    let min_log_mel = 1000.0 / FSP;
    if mel < min_log_mel {
        mel * FSP
    } else {
        1000.0 * ((6.4f64.ln() / 27.0) * (mel - min_log_mel)).exp()
    }
}

/// `librosa.filters.mel(norm="slaney")` over `[0, sr / 2]`, row-major `[num_mels, n_fft / 2 + 1]`.
fn slaney_filterbank(cfg: &MelConfig) -> Vec<f32> {
    let num_freq = cfg.n_fft / 2 + 1;
    let mel_max = hz_to_mel(cfg.sample_rate as f64 / 2.0);
    let bounds = (0..cfg.num_mels + 2)
        .map(|m| mel_to_hz(mel_max * m as f64 / (cfg.num_mels + 1) as f64))
        .collect::<Vec<_>>();
    let mut result = vec![0.0; cfg.num_mels * num_freq];
    for m in 0..cfg.num_mels {
        let (left, center, right) = (bounds[m], bounds[m + 1], bounds[m + 2]);
        let scale = 2.0 / (right - left);
        for k in 0..num_freq {
            let hz = cfg.sample_rate as f64 * k as f64 / cfg.n_fft as f64;
            let lower = (hz - left) / (center - left);
            let upper = (right - hz) / (right - center);
            result[m * num_freq + k] = (lower.min(upper).max(0.0) * scale) as f32;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frontend() -> MelFrontend {
        MelFrontend::new(MelConfig {
            sample_rate: 16_000,
            num_mels: 128,
            n_fft: 512,
            win_length: 400,
            hop_length: 160,
            preemphasis: 0.97,
        })
    }

    #[test]
    fn geometry_matches_center_true() {
        let features = frontend().compute(&vec![0.0; 16_000]);
        assert_eq!((features.num_frames, features.num_valid), (101, 100));
        assert_eq!(features.data.len(), 101 * 128);
        assert!(features.data[100 * 128..].iter().all(|&x| x == 0.0));
        assert!(features.data.iter().all(|x| x.is_finite()));
    }
}
