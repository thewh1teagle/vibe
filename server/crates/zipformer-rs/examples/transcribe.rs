use zipformer_rs::Model;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let model_path = args
        .next()
        .ok_or("usage: transcribe <model.gguf> <vad-model> <audio.wav> [repeat]")?;
    let vad_path = args.next().ok_or("missing VAD model")?;
    let audio_path = args.next().ok_or("missing audio file")?;
    let repeat = args.next().and_then(|value| value.parse().ok()).unwrap_or(1);

    let model = Model::load(model_path)?;
    let mut vad = vad_rs::Vad::new(vad_path, vad_rs::Options::regions())?;
    let mut reader = hound::WavReader::open(audio_path)?;
    if reader.spec().sample_rate != 16_000 || reader.spec().channels != 1 {
        return Err("audio must be 16 kHz mono".into());
    }
    let samples = reader
        .samples::<i16>()
        .map(|sample| sample.map(|value| value as f32 / 32768.0))
        .collect::<Result<Vec<_>, _>>()?;

    let mut total_ms = 0.0;
    let mut result = None;
    for _ in 0..repeat {
        let started = std::time::Instant::now();
        result = Some(model.transcribe(&mut vad, &samples, "he")?);
        total_ms += started.elapsed().as_secs_f64() * 1000.0;
    }
    eprintln!("average: total={:.2} ms", total_ms / repeat as f64);
    let result = result.unwrap();
    let frame_seconds = model.info().frame_seconds;
    for segment in &result.segments {
        let start = segment.tokens.first().map_or(0.0, |token| token.frame as f32 * frame_seconds);
        let end = segment
            .tokens
            .last()
            .map_or(0.0, |token| (token.frame + token.duration_frames) as f32 * frame_seconds);
        println!("[{start:7.2} -> {end:7.2}] {}", segment.text);
    }
    println!("segments={}\ntext={:?}", result.segments.len(), result.text());
    Ok(())
}
