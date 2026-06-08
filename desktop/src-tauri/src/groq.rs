use crate::cmd::TranscribeOptions;
use crate::transcript::{Segment, Transcript};
use eyre::{bail, Context, Result};
use reqwest::multipart;
use serde::Deserialize;
use std::path::Path;
use std::time::Duration;
use tokio_util::io::ReaderStream;

const GROQ_API_URL: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODELS_URL: &str = "https://api.groq.com/openai/v1/models";
const GROQ_MODEL: &str = "whisper-large-v3-turbo";
const GROQ_TIMEOUT: Duration = Duration::from_secs(30);

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
struct ApiErrorResponse {
    error: ApiErrorBody,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    #[allow(dead_code)]
    message: String,
}

fn groq_client() -> reqwest::Client {
    reqwest::Client::builder().timeout(GROQ_TIMEOUT).build().unwrap_or_default()
}

pub async fn test_api_key(api_key: &str) -> Result<bool> {
    let client = groq_client();
    let resp = client
        .get(GROQ_MODELS_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .context("failed to connect to Groq API")?;
    Ok(resp.status().is_success())
}

async fn file_multipart_part(path: &str) -> Result<multipart::Part> {
    let audio_path = Path::new(path);
    let file = tokio::fs::File::open(path).await.context("failed to open audio file")?;
    let file_len = file.metadata().await.context("failed to read file metadata")?.len();
    let file_name = audio_path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let stream = ReaderStream::new(file);
    let body = reqwest::Body::wrap_stream(stream);
    Ok(multipart::Part::stream_with_length(body, file_len)
        .file_name(file_name)
        .mime_str("application/octet-stream")?)
}

pub async fn transcribe(api_key: &str, path: &str, options: &TranscribeOptions) -> Result<Transcript> {
    let client = groq_client();
    let start = std::time::Instant::now();

    let file_part = file_multipart_part(path).await?;

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
        tracing::debug!("translate requested but not supported by Groq API, skipping");
    }

    if let Some(ref p) = options.init_prompt {
        if !p.is_empty() {
            form = form.text("prompt", p.clone());
        }
    }

    if let Some(t) = options.temperature {
        if t.is_finite() && t >= 0.0 {
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
        if let Ok(parsed) = serde_json::from_str::<ApiErrorResponse>(&body) {
            bail!("Groq API error ({}): {}", status, parsed.error.message);
        }
        bail!("Groq API error ({}): {}", status, body);
    }

    let groq_resp: GroqTranscriptionResponse = resp.json().await.context("failed to parse Groq API response")?;

    let segments: Vec<Segment> = groq_resp
        .segments
        .into_iter()
        .map(|s| Segment::from_secs(s.start, s.end, s.text.trim().to_string()))
        .collect();

    let elapsed = start.elapsed();

    Ok(Transcript {
        processing_time_sec: elapsed.as_secs(),
        segments,
    })
}
