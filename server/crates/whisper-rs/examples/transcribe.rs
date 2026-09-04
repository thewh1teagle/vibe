//! Transcribe a WAV file with the pure-Rust whisper port.
//!
//! Usage: cargo run -p whisper-rs --release --example transcribe -- <model.bin> <audio.wav> [language]
//! Set RUST_LOG=info (or debug) for timings and progress.

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();

    let mut args = std::env::args().skip(1);
    let model_path = args.next().expect("usage: transcribe <model.bin> <audio.wav> [language]");
    let wav_path = args.next().expect("usage: transcribe <model.bin> <audio.wav> [language]");
    let language = args.next();

    let samples = read_wav_mono(&wav_path);
    let mut whisper = whisper_rs::Whisper::new(&model_path).expect("load model");

    let params = whisper_rs::FullParams {
        language,
        token_timestamps: true,
        ..Default::default()
    };
    let segments = whisper.full(&params, &samples).expect("transcribe");

    for segment in &segments {
        println!(
            "[{} --> {}] {}",
            format_timestamp(segment.t0),
            format_timestamp(segment.t1),
            segment.text
        );
    }
}

fn format_timestamp(t: i64) -> String {
    let msec = t * 10;
    let hr = msec / 3_600_000;
    let min = msec % 3_600_000 / 60_000;
    let sec = msec % 60_000 / 1000;
    let msec = msec % 1000;
    format!("{hr:02}:{min:02}:{sec:02}.{msec:03}")
}

fn read_wav_mono(path: &str) -> Vec<f32> {
    let mut reader = hound::WavReader::open(path).expect("open wav");
    let spec = reader.spec();
    assert_eq!(spec.sample_rate, 16_000, "{path}: expected 16 kHz");
    let channels = spec.channels as usize;
    let interleaved: Vec<f32> = reader
        .samples::<i16>()
        .map(|sample| sample.expect("wav sample") as f32 / 32768.0)
        .collect();
    interleaved
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}
