//! Writes per-frame speaker probabilities as raw little-endian f32 `[frames, speakers]`, for parity checks.
//!
//! cargo run --release -p nemotron-diarize-rs --example probs -- <model.gguf> <audio.wav> <out.f32>

use std::io::Write;

use nemotron_diarize_rs::Diarizer;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [model, wav, out] = args.as_slice() else {
        return Err("usage: probs <model.gguf> <audio.wav> <out.f32>".into());
    };
    let mut reader = hound::WavReader::open(wav)?;
    let samples = reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32768.0))
        .collect::<Result<Vec<_>, _>>()?;

    let mut diarizer = Diarizer::new(model)?;
    let probs = diarizer.probabilities(&samples)?;
    let mut file = std::fs::File::create(out)?;
    for value in &probs.data[..probs.num_valid * probs.num_speakers] {
        file.write_all(&value.to_le_bytes())?;
    }
    println!("{} frames x {} speakers -> {out}", probs.num_valid, probs.num_speakers);
    Ok(())
}
