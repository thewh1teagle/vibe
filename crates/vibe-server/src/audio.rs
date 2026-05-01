use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result, bail};

pub fn read_audio_mono_f32(path: &Path, enhance_audio: bool) -> Result<Vec<f32>> {
    if !enhance_audio {
        if let Ok(samples) = read_wav_mono_f32(path) {
            return Ok(samples);
        }
    }

    let native_wav = tempfile::Builder::new()
        .prefix("vibe-audio-")
        .suffix(".wav")
        .tempfile()
        .context("create converted wav")?;
    convert_to_native_wav(path, native_wav.path(), enhance_audio)?;
    read_wav_mono_f32(native_wav.path())
}

pub fn read_wav_mono_f32(path: &Path) -> Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path).context("open wav")?;
    let spec = reader.spec();
    if spec.channels == 0 {
        bail!("wav has no channels");
    }

    let channels = spec.channels as usize;
    let mut frames = Vec::new();
    match spec.sample_format {
        hound::SampleFormat::Float => {
            let samples = reader.samples::<f32>().collect::<Result<Vec<_>, _>>()?;
            mix_channels(samples, channels, &mut frames);
        }
        hound::SampleFormat::Int => {
            if spec.bits_per_sample <= 16 {
                let samples = reader
                    .samples::<i16>()
                    .map(|sample| sample.map(|value| value as f32 / i16::MAX as f32))
                    .collect::<Result<Vec<_>, _>>()?;
                mix_channels(samples, channels, &mut frames);
            } else {
                let scale = ((1_i64 << (spec.bits_per_sample - 1)) - 1) as f32;
                let samples = reader
                    .samples::<i32>()
                    .map(|sample| sample.map(|value| value as f32 / scale))
                    .collect::<Result<Vec<_>, _>>()?;
                mix_channels(samples, channels, &mut frames);
            }
        }
    }

    if spec.sample_rate == 16_000 {
        Ok(frames)
    } else {
        Ok(resample_linear(&frames, spec.sample_rate, 16_000))
    }
}

fn convert_to_native_wav(input: &Path, output: &Path, enhance_audio: bool) -> Result<()> {
    let ffmpeg = find_ffmpeg()?;
    let mut args = vec![
        "-i".to_string(),
        input.display().to_string(),
        "-ar".to_string(),
        "16000".to_string(),
        "-ac".to_string(),
        "1".to_string(),
    ];
    if enhance_audio {
        args.extend([
            "-af".to_string(),
            "silenceremove=stop_periods=-1:stop_duration=0.7:stop_threshold=-45dB".to_string(),
        ]);
    }
    args.extend([
        "-acodec".to_string(),
        "pcm_s16le".to_string(),
        "-y".to_string(),
        output.display().to_string(),
    ]);

    let output = Command::new(ffmpeg).args(args).output().context("run ffmpeg")?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stderr = if stderr.len() > 500 { &stderr[..500] } else { &stderr };
    bail!("ffmpeg WAV conversion failed: {stderr}")
}

fn find_ffmpeg() -> Result<std::path::PathBuf> {
    if let Some(path) = find_executable_in_path("ffmpeg") {
        return Ok(path);
    }
    for key in ["VIBE_FFMPEG_PATH", "SONA_FFMPEG_PATH"] {
        if let Some(path) = std::env::var_os(key).map(std::path::PathBuf::from) {
            if path.exists() {
                return Ok(path);
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in ["ffmpeg", "ffmpeg.exe"] {
                let candidate = dir.join(name);
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
        }
    }
    bail!("ffmpeg not found")
}

fn find_executable_in_path(name: &str) -> Option<std::path::PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|path| path.join(name))
            .find(|path| path.exists())
    })
}

fn mix_channels(samples: Vec<f32>, channels: usize, out: &mut Vec<f32>) {
    out.reserve(samples.len() / channels);
    for frame in samples.chunks(channels) {
        out.push(frame.iter().copied().sum::<f32>() / frame.len() as f32);
    }
}

fn resample_linear(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if input.is_empty() || from == to {
        return input.to_vec();
    }
    let output_len = input.len() * to as usize / from as usize;
    let ratio = from as f64 / to as f64;
    let mut output = Vec::with_capacity(output_len);
    for index in 0..output_len {
        let position = index as f64 * ratio;
        let left = position.floor() as usize;
        let right = (left + 1).min(input.len() - 1);
        let frac = (position - left as f64) as f32;
        output.push(input[left] * (1.0 - frac) + input[right] * frac);
    }
    output
}
