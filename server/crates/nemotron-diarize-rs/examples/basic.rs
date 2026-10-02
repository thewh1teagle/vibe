//! cargo run --release -p nemotron-diarize-rs --example basic -- <model.gguf> <audio.wav>
//!
//! RUST_LOG=nemotron_diarize_rs=debug shows per-chunk timings.

use nemotron_diarize_rs::Diarizer;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let mut args = std::env::args().skip(1);
    let model = args.next().ok_or("usage: basic <model.gguf> <audio.wav>")?;
    let wav = args.next().ok_or("usage: basic <model.gguf> <audio.wav>")?;

    let mut diarizer = Diarizer::new(model)?;
    for s in diarizer.diarize(wav)? {
        println!("speaker_{}: {:.2}s - {:.2}s", s.speaker_id, s.start, s.end);
    }
    Ok(())
}
