//! Kaldi-compatible log mel filterbank features, as the model was trained on:
//! 25 ms Povey-windowed frames every 10 ms, `snip_edges = false`, DC removal,
//! 0.97 preemphasis, 80 kaldi-scale mel bins over 20..7600 Hz, natural log of
//! the power with a `FLT_EPSILON` floor and no normalization.

use std::f64::consts::PI;
use std::sync::Arc;

use rayon::prelude::*;
use rustfft::num_complex::Complex64;
use rustfft::{Fft, FftPlanner};

pub(crate) const SAMPLE_RATE: usize = 16_000;
pub(crate) const NUM_BINS: usize = 80;
const FRAME_LENGTH: usize = 400;
const FRAME_SHIFT: usize = 160;
const FFT_SIZE: usize = 512;
const PREEMPHASIS: f64 = 0.97;
const LOW_FREQ: f64 = 20.0;
const HIGH_FREQ: f64 = 7600.0;
const LOG_FLOOR: f64 = f32::EPSILON as f64;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Features {
    pub frames: usize,
    pub bins: usize,
    /// Row-major `[frames][bins]`.
    pub data: Vec<f32>,
}

impl Features {
    /// Appends `frames` rows of `value`. The model needs this tail to flush
    /// the last words out of the encoder; the value is the trained-in
    /// `ln(1e-10)`, not the feature value of digital silence.
    pub(crate) fn pad_tail(&mut self, frames: usize, value: f32) {
        self.frames += frames;
        self.data.resize(self.frames * self.bins, value);
    }
}

struct MelBin {
    first: usize,
    weights: Vec<f64>,
}

pub(crate) struct Fbank {
    window: Vec<f64>,
    bins: Vec<MelBin>,
    fft: Arc<dyn Fft<f64>>,
}

impl Fbank {
    pub(crate) fn new() -> Self {
        let window = (0..FRAME_LENGTH)
            .map(|n| (0.5 - 0.5 * (2.0 * PI * n as f64 / (FRAME_LENGTH - 1) as f64).cos()).powf(0.85))
            .collect();
        Self {
            window,
            bins: mel_bins(),
            fft: FftPlanner::<f64>::new().plan_fft_forward(FFT_SIZE),
        }
    }

    pub(crate) fn frame_count(samples: usize) -> usize {
        (samples + FRAME_SHIFT / 2) / FRAME_SHIFT
    }

    pub(crate) fn compute(&self, samples: &[f32]) -> Features {
        let frames = Self::frame_count(samples.len());
        let mut data = vec![0.0f32; frames * NUM_BINS];
        data.par_chunks_mut(NUM_BINS).enumerate().for_each_init(
            || (vec![0.0f64; FRAME_LENGTH], vec![Complex64::default(); FFT_SIZE]),
            |(frame, spectrum), (index, row)| self.frame(samples, index, frame, spectrum, row),
        );
        Features {
            frames,
            bins: NUM_BINS,
            data,
        }
    }

    fn frame(&self, samples: &[f32], index: usize, frame: &mut [f64], spectrum: &mut [Complex64], row: &mut [f32]) {
        let start = (index * FRAME_SHIFT) as i64 - ((FRAME_LENGTH - FRAME_SHIFT) / 2) as i64;
        for (n, value) in frame.iter_mut().enumerate() {
            *value = samples[reflect(start + n as i64, samples.len() as i64)] as f64;
        }
        let mean = frame.iter().sum::<f64>() / FRAME_LENGTH as f64;
        for value in frame.iter_mut() {
            *value -= mean;
        }
        for n in (1..FRAME_LENGTH).rev() {
            frame[n] -= PREEMPHASIS * frame[n - 1];
        }
        frame[0] -= PREEMPHASIS * frame[0];

        spectrum.fill(Complex64::default());
        for ((slot, value), window) in spectrum.iter_mut().zip(frame.iter()).zip(&self.window) {
            slot.re = value * window;
        }
        self.fft.process(spectrum);
        for (out, bin) in row.iter_mut().zip(&self.bins) {
            let energy = bin
                .weights
                .iter()
                .zip(&spectrum[bin.first..])
                .map(|(weight, value)| weight * value.norm_sqr())
                .sum::<f64>();
            *out = energy.max(LOG_FLOOR).ln() as f32;
        }
    }
}

/// Kaldi's edge handling for `snip_edges = false`: mirror around the ends
/// without repeating the edge sample's neighbour, as often as it takes.
fn reflect(mut index: i64, len: i64) -> usize {
    while index < 0 || index >= len {
        index = if index < 0 { -index - 1 } else { 2 * len - 1 - index };
    }
    index as usize
}

fn mel(frequency: f64) -> f64 {
    1127.0 * (1.0 + frequency / 700.0).ln()
}

/// Triangles on the mel axis without area normalization. The Nyquist bin
/// carries no weight.
fn mel_bins() -> Vec<MelBin> {
    let low = mel(LOW_FREQ);
    let delta = (mel(HIGH_FREQ) - low) / (NUM_BINS + 1) as f64;
    let fft_bin_width = SAMPLE_RATE as f64 / FFT_SIZE as f64;
    (0..NUM_BINS)
        .map(|bin| {
            let left = low + bin as f64 * delta;
            let center = left + delta;
            let right = center + delta;
            let mut first = 0;
            let mut weights = Vec::new();
            for k in 0..FFT_SIZE / 2 {
                let m = mel(k as f64 * fft_bin_width);
                if m <= left || m >= right {
                    continue;
                }
                if weights.is_empty() {
                    first = k;
                }
                weights.push(if m <= center {
                    (m - left) / delta
                } else {
                    (right - m) / delta
                });
            }
            MelBin { first, weights }
        })
        .collect()
}

#[cfg(test)]
pub(crate) mod testdata {
    //! Access to the reference dumps for the `#[ignore]`d tests:
    //! `ZIPFORMER_REF_DIR` holds one directory per clip, `ZIPFORMER_GGUF` is the model.

    use std::path::{Path, PathBuf};

    pub(crate) const CLIPS: [&str; 4] = ["tts05", "tts15", "tts28", "tts_gaps"];

    pub(crate) fn clip(name: &str) -> PathBuf {
        PathBuf::from(std::env::var("ZIPFORMER_REF_DIR").expect("set ZIPFORMER_REF_DIR")).join(name)
    }

    pub(crate) fn gguf() -> PathBuf {
        PathBuf::from(std::env::var("ZIPFORMER_GGUF").expect("set ZIPFORMER_GGUF"))
    }

    pub(crate) struct Npy {
        pub shape: Vec<usize>,
        bytes: Vec<u8>,
        kind: String,
    }

    impl Npy {
        pub(crate) fn read(path: &Path) -> Self {
            let file = std::fs::read(path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
            assert_eq!(&file[..6], b"\x93NUMPY");
            let (header_start, header_len) = if file[6] == 1 {
                (10, u16::from_le_bytes([file[8], file[9]]) as usize)
            } else {
                (12, u32::from_le_bytes([file[8], file[9], file[10], file[11]]) as usize)
            };
            let header = std::str::from_utf8(&file[header_start..header_start + header_len]).unwrap();
            assert!(header.contains("'fortran_order': False"), "{header}");
            let kind = header
                .split("'descr': '")
                .nth(1)
                .unwrap()
                .split('\'')
                .next()
                .unwrap()
                .to_owned();
            let shape = header.split("'shape': (").nth(1).unwrap().split(')').next().unwrap();
            let shape = shape.split(',').filter_map(|dim| dim.trim().parse().ok()).collect();
            Self {
                shape,
                bytes: file[header_start + header_len..].to_vec(),
                kind,
            }
        }

        pub(crate) fn f32(&self) -> Vec<f32> {
            assert_eq!(self.kind, "<f4");
            self.words().map(f32::from_le_bytes).collect()
        }

        pub(crate) fn i32(&self) -> Vec<i32> {
            assert_eq!(self.kind, "<i4");
            self.words().map(i32::from_le_bytes).collect()
        }

        fn words(&self) -> impl Iterator<Item = [u8; 4]> + '_ {
            self.bytes.as_chunks::<4>().0.iter().copied()
        }
    }

    pub(crate) fn max_abs_diff(a: &[f32], b: &[f32]) -> f32 {
        assert_eq!(a.len(), b.len());
        a.iter().zip(b).map(|(x, y)| (x - y).abs()).fold(0.0, f32::max)
    }
}

#[cfg(test)]
mod tests {
    use super::testdata::{clip, max_abs_diff, Npy, CLIPS};
    use super::*;

    #[test]
    fn frame_count_follows_snip_edges_false() {
        assert_eq!(Fbank::frame_count(0), 0);
        assert_eq!(Fbank::frame_count(79), 0);
        assert_eq!(Fbank::frame_count(80), 1);
        assert_eq!(Fbank::frame_count(69_030), 431);
        assert_eq!(Fbank::frame_count(480_000), 3000);
    }

    #[test]
    fn reflects_edges_without_repeating_the_pivot() {
        assert_eq!(reflect(-1, 10), 0);
        assert_eq!(reflect(-3, 10), 2);
        assert_eq!(reflect(10, 10), 9);
        assert_eq!(reflect(12, 10), 7);
        assert_eq!(reflect(-25, 10), 4);
    }

    #[test]
    fn mel_bins_cover_the_band_and_skip_nyquist() {
        let bins = mel_bins();
        assert_eq!(bins.len(), NUM_BINS);
        assert_eq!(bins[0].first, 1);
        let last = bins.last().unwrap();
        assert!(last.first + last.weights.len() <= FFT_SIZE / 2);
        assert!(bins.iter().all(|bin| !bin.weights.is_empty()));
        assert!(bins
            .iter()
            .flat_map(|bin| &bin.weights)
            .all(|&weight| weight > 0.0 && weight <= 1.0));
    }

    #[test]
    fn silence_sits_on_the_log_floor_and_the_tail_pad_below_it() {
        let mut features = Fbank::new().compute(&[0.0; 1600]);
        assert_eq!((features.frames, features.bins), (10, 80));
        assert!(features.data.iter().all(|&value| (value - f32::EPSILON.ln()).abs() < 1e-6));
        features.pad_tail(30, 1e-10f32.ln());
        assert_eq!(features.frames, 40);
        assert_eq!(features.data.len(), 40 * 80);
        assert!((features.data[10 * 80] + 23.025_85).abs() < 1e-5);
    }

    #[test]
    fn short_audio_still_yields_frames() {
        let samples = (0..200).map(|n| (n as f32 * 0.3).sin() * 0.1).collect::<Vec<_>>();
        let features = Fbank::new().compute(&samples);
        assert_eq!(features.frames, 1);
        assert!(features.data.iter().all(|value| value.is_finite()));
    }

    #[test]
    #[ignore = "needs ZIPFORMER_REF_DIR"]
    fn matches_reference_fbank() {
        let fbank = Fbank::new();
        for name in CLIPS {
            let dir = clip(name);
            let samples = Npy::read(&dir.join("samples.npy")).f32();
            let reference = Npy::read(&dir.join("fbank.npy"));
            let mut features = fbank.compute(&samples);
            features.pad_tail(30, 1e-10f32.ln());
            assert_eq!(reference.shape, [features.frames, features.bins]);
            let expected = reference.f32();
            let max = max_abs_diff(&features.data, &expected);
            let mean = features
                .data
                .iter()
                .zip(&expected)
                .map(|(a, b)| (a - b).abs() as f64)
                .sum::<f64>()
                / expected.len() as f64;
            let loud = features
                .data
                .iter()
                .zip(&expected)
                .filter(|(_, &b)| b > -10.0)
                .map(|(a, b)| (a - b).abs())
                .fold(0.0, f32::max);
            eprintln!("{name}: fbank max_abs={max:.3e} mean_abs={mean:.3e} max_abs(ref > -10)={loud:.3e}");
            assert!(max < 5e-3, "{name}: {max}");
            assert!(loud < 5e-4, "{name}: {loud}");
            assert!(mean < 1e-5, "{name}: {mean}");
        }
    }
}
