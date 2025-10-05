use crate::config::TranscribeOptions;
use crate::transcript::{Segment, Transcript};
use eyre::{bail, Context, Result};
use serde_json;

#[derive(Debug, Clone)]
pub struct DiarizeOptions {
    pub segment_model_path: String,
    pub embedding_model_path: String,
    pub threshold: f32,
    pub max_speakers: usize,
}

pub fn transcribe(
    options: &TranscribeOptions,
    _progress_callback: Option<Box<dyn Fn(i32) + Send + Sync>>,
    _new_segment_callback: Option<Box<dyn Fn(Segment)>>,
    _abort_callback: Option<Box<dyn Fn() -> bool>>,
    _diarize_options: Option<DiarizeOptions>,
    _additional_ffmpeg_args: Option<Vec<String>>,
) -> Result<Transcript> {
    // For now, use faster-whisper via subprocess
    // TODO: Integrate properly
    use std::process::Command;

    let st = std::time::Instant::now();

    let current_dir = std::env::current_dir()?;
    println!("DEBUG: current_dir = {:?}", current_dir);
    let script_path = current_dir
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("scripts")
        .join("transcribe_faster_whisper.py");
    println!("DEBUG: script_path = {:?}", script_path);
    let model = options.model.as_ref().unwrap_or(&"base".to_string()).clone();
    let output = Command::new("python3")
        .arg(script_path)
        .arg(&model)
        .arg(&options.path)
        .output()
        .context("Failed to run faster-whisper script")?;

    if !output.status.success() {
        bail!(
            "faster-whisper script failed with exit code {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let json_output: serde_json::Value =
        serde_json::from_slice(&output.stdout).context("Failed to parse JSON output from faster-whisper script")?;
    let segments: Vec<Segment> = json_output["segments"]
        .as_array()
        .unwrap()
        .iter()
        .map(|seg| Segment {
            start: (seg["start"].as_f64().unwrap() * 100.0) as i64,
            stop: (seg["end"].as_f64().unwrap() * 100.0) as i64,
            text: seg["text"].as_str().unwrap().to_string(),
            speaker: None,
        })
        .collect();

    let transcript = Transcript {
        segments,
        processing_time_sec: std::time::Instant::now().duration_since(st).as_secs(),
    };

    Ok(transcript)
}
