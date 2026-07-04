use std::path::Path;

use whisper_rs::{Context, ContextOptions, TranscribeOptions};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let model_path = args
        .next()
        .ok_or("usage: cargo run -p whisper-rs --features ffi,hound --example transcribe -- <model.bin> <audio.wav>")?;
    let audio_path = args
        .next()
        .ok_or("usage: cargo run -p whisper-rs --features ffi,hound --example transcribe -- <model.bin> <audio.wav>")?;

    let vad_model_path = args.next();

    let samples = read_wav(&audio_path)?;
    let mut ctx = Context::new(model_path, ContextOptions::default())?;
    let result = ctx.transcribe(
        &samples,
        TranscribeOptions {
            stable_timestamps: vad_model_path.is_some(),
            vad_model_path,
            ..TranscribeOptions::default()
        },
    )?;
    println!("{}", result.text());
    Ok(())
}

fn read_wav(path: impl AsRef<Path>) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    let mut reader = hound::WavReader::open(path)?;
    let spec = reader.spec();

    if spec.channels != 1 || spec.sample_rate != 16_000 {
        return Err(format!(
            "expected 16kHz mono WAV, got {}Hz {} channels",
            spec.sample_rate, spec.channels
        )
        .into());
    }

    let samples = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().collect::<Result<Vec<_>, _>>()?,
        hound::SampleFormat::Int => reader
            .samples::<i16>()
            .map(|sample| sample.map(|sample| sample as f32 / 32768.0))
            .collect::<Result<Vec<_>, _>>()?,
    };
    Ok(samples)
}
