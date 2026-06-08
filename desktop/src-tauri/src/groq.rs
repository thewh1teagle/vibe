use crate::cmd::TranscribeOptions;
use crate::transcript::{Segment, Transcript};
use eyre::{bail, Context, Result};
use reqwest::multipart;
use serde::Deserialize;
use std::path::Path;
use tokio_util::io::ReaderStream;

const GROQ_API_URL: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL: &str = "whisper-large-v3-turbo";

#[derive(Debug, Deserialize)]
struct GroqSegment {
    #[allow(dead_code)]
    id: Option<i32>,
    start: f64,
    end: f64,
    text: String,
}

#[derive(Debug, Deserialize)]
struct GroqTranscriptionResponse {
    #[allow(dead_code)]
    text: String,
    #[serde(default)]
    segments: Vec<GroqSegment>,
}

#[derive(Debug, Deserialize)]
struct GroqErrorResponse {
    error: GroqErrorBody,
}

#[derive(Debug, Deserialize)]
struct GroqErrorBody {
    #[allow(dead_code)]
    message: String,
}

pub async fn transcribe(api_key: &str, path: &str, options: &TranscribeOptions) -> Result<Transcript> {
    let audio_path = Path::new(path);
    if !audio_path.exists() {
        bail!("Audio file not found: {}", path);
    }

    let client = reqwest::Client::new();
    let start = std::time::Instant::now();

    let file = tokio::fs::File::open(path).await.context("failed to open audio file")?;
    let file_len = file.metadata().await.context("failed to read file metadata")?.len();

    let file_name = audio_path.file_name().unwrap_or_default().to_string_lossy().to_string();

    let stream = ReaderStream::new(file);
    let body = reqwest::Body::wrap_stream(stream);

    let file_part = multipart::Part::stream_with_length(body, file_len)
        .file_name(file_name)
        .mime_str("application/octet-stream")?;

    let mut form = multipart::Form::new()
        .part("file", file_part)
        .text("model", GROQ_MODEL.to_string())
        .text("response_format", "verbose_json".to_string())
        .text("timestamp_granularities[]", "segment".to_string());

    if let Some(ref lang) = options.lang {
        if !lang.is_empty() && lang != "auto" {
            form = form.text("language", lang.clone());
        }
    }

    if options.translate.unwrap_or(false) {
        // Groq uses a separate /translations endpoint, but we can use the
        // translate field on the transcriptions endpoint via prompt guidance.
        // For now, we'll just pass the translate option - Groq's whisper
        // doesn't have a native translate flag, so we skip it.
        tracing::debug!("translate requested but not supported by Groq API, skipping");
    }

    if let Some(ref p) = options.init_prompt {
        if !p.is_empty() {
            form = form.text("prompt", p.clone());
        }
    }

    if let Some(t) = options.temperature {
        if t >= 0.0 {
            form = form.text("temperature", t.to_string());
        }
    }

    let resp = client
        .post(GROQ_API_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .context("failed to send request to Groq API")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if let Ok(parsed) = serde_json::from_str::<GroqErrorResponse>(&body) {
            bail!("Groq API error ({}): {}", status, parsed.error.message);
        }
        bail!("Groq API error ({}): {}", status, body);
    }

    let groq_resp: GroqTranscriptionResponse = resp.json().await.context("failed to parse Groq API response")?;

    let segments: Vec<Segment> = groq_resp
        .segments
        .into_iter()
        .map(|s| Segment {
            start: (s.start * 100.0).round() as i64,
            stop: (s.end * 100.0).round() as i64,
            text: s.text.trim().to_string(),
            speaker: None,
        })
        .collect();

    let elapsed = start.elapsed();

    Ok(Transcript {
        processing_time_sec: elapsed.as_secs(),
        segments,
    })
}
