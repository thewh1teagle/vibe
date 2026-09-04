use rayon::prelude::*;
use rustfft::num_complex::Complex64;
use rustfft::{Fft, FftPlanner};
use std::f64::consts::PI;
use std::sync::Arc;

use crate::{Error, Result};

const LOG_EPS: f64 = 5.960_464_477_539_063e-8;

#[derive(Debug, Clone)]
pub struct MelConfig {
    pub sample_rate: usize,
    pub num_mels: usize,
    pub n_fft: usize,
    pub win_length: usize,
    pub hop_length: usize,
    pub pre_emphasis: f32,
    pub f_min: f32,
    pub f_max: f32,
}

impl Default for MelConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16_000,
            num_mels: 128,
            n_fft: 512,
            win_length: 400,
            hop_length: 160,
            pre_emphasis: 0.97,
            f_min: 0.0,
            f_max: 8_000.0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MelFeatures {
    /// Row-major `[num_mels, num_frames]` natural-log mel power.
    pub data: Vec<f32>,
    pub num_mels: usize,
    pub num_frames: usize,
}

pub struct MelFrontend {
    config: MelConfig,
    window: Vec<f64>,
    filterbank: Vec<f32>,
    fft: Arc<dyn Fft<f64>>,
}

impl MelFrontend {
    pub fn new(config: MelConfig) -> Result<Self> {
        if config.n_fft == 0
            || !config.n_fft.is_power_of_two()
            || config.win_length > config.n_fft
            || config.hop_length == 0
            || config.num_mels == 0
        {
            return Err(Error::InvalidMetadata {
                key: "stt.frontend",
                message: "invalid FFT/mel dimensions".into(),
            });
        }
        let window = hann_symmetric_padded(config.win_length, config.n_fft);
        let filterbank = slaney_filterbank(&config);
        let fft = FftPlanner::<f64>::new().plan_fft_forward(config.n_fft);
        Ok(Self {
            config,
            window,
            filterbank,
            fft,
        })
    }

    pub fn config(&self) -> &MelConfig {
        &self.config
    }

    pub fn compute(&self, pcm: &[f32]) -> Result<MelFeatures> {
        let cfg = &self.config;
        let pad = cfg.n_fft / 2;
        if pcm.len() < pad + 1 {
            return Err(Error::Load(
                "audio is too short for Nemotron's reflect-padded frontend".into(),
            ));
        }
        let num_frames = pcm.len() / cfg.hop_length + 1;
        let mut emphasized = vec![0.0f64; pcm.len()];
        emphasized[0] = pcm[0] as f64;
        for i in 1..pcm.len() {
            emphasized[i] = pcm[i] as f64 - cfg.pre_emphasis as f64 * pcm[i - 1] as f64;
        }
        let mut padded = vec![0.0f64; pcm.len() + 2 * pad];
        for i in 0..pad {
            padded[i] = emphasized[pad - i];
        }
        padded[pad..pad + pcm.len()].copy_from_slice(&emphasized);
        for i in 0..pad {
            padded[pad + pcm.len() + i] = emphasized[pcm.len() - 2 - i];
        }

        let num_freq = cfg.n_fft / 2 + 1;
        let frames = (0..num_frames)
            .into_par_iter()
            .map_init(
                || (vec![Complex64::default(); cfg.n_fft], vec![0.0f32; num_freq]),
                |(frame, power), t| {
                    let start = t * cfg.hop_length;
                    for k in 0..cfg.n_fft {
                        frame[k] = Complex64::new(padded[start + k] * self.window[k], 0.0);
                    }
                    self.fft.process(frame);
                    for k in 0..num_freq {
                        power[k] = frame[k].norm_sqr() as f32;
                    }
                    (0..cfg.num_mels)
                        .map(|m| {
                            let row = &self.filterbank[m * num_freq..(m + 1) * num_freq];
                            let sum = row.iter().zip(power.iter()).map(|(&a, &b)| a as f64 * b as f64).sum::<f64>();
                            (sum + LOG_EPS).ln() as f32
                        })
                        .collect::<Vec<_>>()
                },
            )
            .collect::<Vec<_>>();
        let mut output = vec![0.0f32; cfg.num_mels * num_frames];
        for (t, frame) in frames.iter().enumerate() {
            for m in 0..cfg.num_mels {
                output[m * num_frames + t] = frame[m];
            }
        }
        Ok(MelFeatures {
            data: output,
            num_mels: cfg.num_mels,
            num_frames,
        })
    }
}

fn hann_symmetric_padded(win_length: usize, n_fft: usize) -> Vec<f64> {
    let mut result = vec![0.0; n_fft];
    let offset = (n_fft - win_length) / 2;
    for k in 0..win_length {
        result[offset + k] = 0.5 - 0.5 * (2.0 * PI * k as f64 / (win_length - 1) as f64).cos();
    }
    result
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

fn slaney_filterbank(cfg: &MelConfig) -> Vec<f32> {
    let num_freq = cfg.n_fft / 2 + 1;
    let mel_min = hz_to_mel(cfg.f_min as f64);
    let mel_max = hz_to_mel(cfg.f_max as f64);
    let bounds = (0..cfg.num_mels + 2)
        .map(|m| mel_to_hz(mel_min + (mel_max - mel_min) * m as f64 / (cfg.num_mels + 1) as f64))
        .collect::<Vec<_>>();
    let mut result = vec![0.0; cfg.num_mels * num_freq];
    for m in 0..cfg.num_mels {
        let left = bounds[m];
        let center = bounds[m + 1];
        let right = bounds[m + 2];
        let scale = 2.0 / (right - left);
        for k in 0..num_freq {
            let hz = cfg.sample_rate as f64 * k as f64 / cfg.n_fft as f64;
            let lower = (hz - left) / (center - left);
            let upper = (right - hz) / (right - center);
            result[m * num_freq + k] = lower.min(upper).max(0.0).mul_add(scale, 0.0) as f32;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nemotron_geometry() {
        let frontend = MelFrontend::new(MelConfig::default()).unwrap();
        let features = frontend.compute(&vec![0.0; 16_000]).unwrap();
        assert_eq!((features.num_mels, features.num_frames), (128, 101));
        assert!(features.data.iter().all(|x| x.is_finite()));
    }
}
