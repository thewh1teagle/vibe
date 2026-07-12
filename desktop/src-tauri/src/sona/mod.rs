mod devices;
mod process;
#[cfg(test)]
mod tests;

use eyre::{bail, Context, Result};
use futures_util::StreamExt;
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Child;
use std::sync::{Arc, Mutex};
use tokio::io::AsyncRead;
use tokio_util::codec::{FramedRead, LinesCodec};
use tokio_util::io::{ReaderStream, StreamReader};

pub use devices::list_gpu_devices;

const MAX_EVENT_LINE_LENGTH: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GpuDevice {
    pub index: i32,
    pub name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub device_type: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelCapabilities {
    pub engine: String,
    pub requires_vad: bool,
    pub languages: Vec<String>,
    pub language_detection: bool,
    pub streaming: bool,
    pub translation: bool,
    pub timestamps: bool,
    pub text_prompts: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelMetadata {
    pub format: String,
    pub capabilities: ModelCapabilities,
}

pub struct SonaProcess {
    port: u16,
    child: Child,
    client: reqwest::Client,
    stderr_buf: Arc<Mutex<String>>,
}

#[derive(Debug, Deserialize)]
struct ReadySignal {
    #[allow(dead_code)]
    status: String,
    port: u16,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum SonaEvent {
    Progress {
        progress: i32,
    },
    Segment {
        start: f64,
        end: f64,
        text: String,
        speaker: Option<i32>,
    },
    Result {
        text: String,
    },
    Error {
        code: Option<String>,
        message: String,
    },
}

#[derive(Debug, Deserialize)]
struct SonaErrorResponse {
    error: SonaErrorBody,
}

#[derive(Debug, Deserialize)]
struct SonaErrorBody {
    code: Option<String>,
    message: String,
}

#[derive(Debug)]
pub struct SonaApiError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for SonaApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for SonaApiError {}

fn decode_event_reader<R>(reader: R) -> impl futures_util::Stream<Item = Result<SonaEvent>>
where
    R: AsyncRead,
{
    FramedRead::new(reader, LinesCodec::new_with_max_length(MAX_EVENT_LINE_LENGTH)).filter_map(|line_result| async move {
        match line_result {
            Ok(line) if line.trim().is_empty() => None,
            Ok(line) => Some(serde_json::from_str::<SonaEvent>(&line).context("failed to parse sona event")),
            Err(error) => Some(Err(eyre::eyre!("failed to read sona event line: {error}"))),
        }
    })
}

impl SonaProcess {
    pub async fn model_metadata(&self, path: &str) -> Result<ModelMetadata> {
        let response = self
            .client
            .post(format!("{}/v1/models/metadata", self.base_url()))
            .json(&serde_json::json!({ "path": path }))
            .send()
            .await
            .context("failed to request model metadata")?;
        if !response.status().is_success() {
            bail!("sona model metadata failed: {}", response.text().await.unwrap_or_default());
        }
        response.json().await.context("failed to parse model metadata")
    }

    pub async fn transcribe_stream(
        client: &reqwest::Client,
        base_url: &str,
        options: &crate::cmd::TranscribeOptions,
    ) -> Result<impl futures_util::Stream<Item = Result<SonaEvent>>> {
        let url = format!("{}/v1/audio/transcriptions", base_url);
        let file = tokio::fs::File::open(&options.path)
            .await
            .context("failed to open audio file")?;
        let file_len = file.metadata().await.context("failed to read file metadata")?.len();
        let file_name = Path::new(&options.path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let body = reqwest::Body::wrap_stream(ReaderStream::new(file));
        let file_part = multipart::Part::stream_with_length(body, file_len)
            .file_name(file_name)
            .mime_str("application/octet-stream")?;
        let mut form = multipart::Form::new().part("file", file_part).text("stream", "true");

        if let Some(ref lang) = options.lang {
            if !lang.is_empty() {
                form = form.text("language", lang.clone());
            }
        }
        if options.translate.unwrap_or(false) {
            form = form.text("translate", "true");
        }
        if let Some(ref prompt) = options.init_prompt {
            if !prompt.is_empty() {
                form = form.text("prompt", prompt.clone());
            }
        }
        for (name, value) in [
            ("n_threads", options.n_threads),
            ("max_text_ctx", options.max_text_ctx),
            ("best_of", options.best_of),
            ("beam_size", options.beam_size),
        ] {
            if let Some(value) = value.filter(|value| *value > 0) {
                form = form.text(name, value.to_string());
            }
        }
        if let Some(value) = options.max_sentence_len.filter(|value| *value > 1) {
            form = form.text("max_segment_len", value.to_string());
        }
        if let Some(temperature) = options.temperature.filter(|value| *value > 0.0) {
            form = form.text("temperature", temperature.to_string());
        }
        if options.word_timestamps.unwrap_or(false) {
            form = form.text("word_timestamps", "true");
        }
        if options.sampling_strategy.as_deref() == Some("beam search") {
            form = form.text("sampling_strategy", "beam_search");
        }
        if let Some(ref model) = options.diarize_model {
            if !model.is_empty() {
                form = form.text("diarize_model", model.clone());
            }
        }
        if options.stable_timestamps.unwrap_or(false) {
            form = form.text("stable_timestamps", "true");
        }
        if let Some(ref model) = options.vad_model {
            if !model.is_empty() {
                form = form.text("vad_model", model.clone());
            }
        }

        let response = client
            .post(&url)
            .multipart(form)
            .send()
            .await
            .map_err(|error| eyre::eyre!("failed to send transcribe request to sona: {error}"))?;
        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            if let Ok(parsed) = serde_json::from_str::<SonaErrorResponse>(&body) {
                return Err(eyre::Report::new(SonaApiError {
                    code: parsed.error.code.unwrap_or_else(|| "internal_error".to_string()),
                    message: parsed.error.message,
                }));
            }
            bail!("sona transcribe failed: {}", body);
        }

        let byte_stream = response.bytes_stream().map(|result| result.map_err(std::io::Error::other));
        Ok(decode_event_reader(StreamReader::new(byte_stream)))
    }
}
