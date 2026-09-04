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

pub struct ServerProcess {
    port: u16,
    unload_timeout_minutes: u32,
    child: Child,
    /// Cached because `try_wait` hands the status over exactly once.
    exit_status: Option<std::process::ExitStatus>,
    client: reqwest::Client,
    stderr_buf: Arc<Mutex<StderrTail>>,
}

/// The child's most recent stderr. A crash message is the *last* thing written,
/// so the cap drops the oldest output rather than the newest — a chatty startup
/// used to push the interesting line out of the buffer.
#[derive(Default)]
struct StderrTail {
    text: String,
    /// Set when the collector stopped: `None` on a clean EOF, `Some` when a read
    /// failed (invalid UTF-8, say), which otherwise looks like silence.
    read_error: Option<String>,
    finished: bool,
}

impl StderrTail {
    const LIMIT: usize = 8192;

    fn push(&mut self, line: &str) {
        self.text.push_str(line);
        if self.text.len() > Self::LIMIT {
            // Keep the tail, on a char boundary so the string stays valid.
            let mut cut = self.text.len() - Self::LIMIT;
            while cut < self.text.len() && !self.text.is_char_boundary(cut) {
                cut += 1;
            }
            self.text.drain(..cut);
        }
    }

    fn finish(&mut self, read_error: Option<String>) {
        self.read_error = read_error;
        self.finished = true;
    }

    fn is_finished(&self) -> bool {
        self.finished
    }

    fn snapshot(&self) -> String {
        let text = self.text.trim();
        match &self.read_error {
            Some(error) if text.is_empty() => format!("<stderr read failed: {error}>"),
            Some(error) => format!("{text}\n<stderr read failed: {error}>"),
            None => text.to_string(),
        }
    }
}

/// Ask the sidecar whether it is still alive, and describe its death if not. The
/// transcribe paths hold only a client and a url — the child lives in shared
/// state — so a mid-stream death reaches them as a decode error unless they come
/// back and ask.
pub async fn death_report(state: &tokio::sync::Mutex<crate::setup::ServerState>, context: &str) -> Option<String> {
    let mut state = state.lock().await;
    state.process.as_mut()?.death_report(context).await
}

/// What the sidecar printed lately, for an error that is not a death but that its
/// stderr may still explain (a GPU driver complaining before the request fails, say).
pub async fn recent_stderr(state: &tokio::sync::Mutex<crate::setup::ServerState>) -> String {
    let state = state.lock().await;
    state
        .process
        .as_ref()
        .map(|process| process.recent_stderr())
        .unwrap_or_default()
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
pub enum ServerEvent {
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
struct ServerErrorResponse {
    error: ServerErrorBody,
}

#[derive(Debug, Deserialize)]
struct ServerErrorBody {
    code: Option<String>,
    message: String,
}

#[derive(Debug)]
pub struct ServerApiError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for ServerApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for ServerApiError {}

/// True for failures that happened before the server could act on the request —
/// a dead pooled socket or a refused connect. Anything that got a response, or
/// failed while streaming the body, is left alone.
fn is_connection_failure(error: &reqwest::Error) -> bool {
    error.is_connect() || (error.is_request() && !error.is_body())
}

fn decode_event_reader<R>(reader: R) -> impl futures_util::Stream<Item = Result<ServerEvent>>
where
    R: AsyncRead,
{
    FramedRead::new(reader, LinesCodec::new_with_max_length(MAX_EVENT_LINE_LENGTH)).filter_map(|line_result| async move {
        match line_result {
            Ok(line) if line.trim().is_empty() => None,
            Ok(line) => Some(serde_json::from_str::<ServerEvent>(&line).context("failed to parse server event")),
            Err(error) => Some(Err(eyre::eyre!("failed to read server event line: {error}"))),
        }
    })
}

impl ServerProcess {
    pub async fn model_metadata(&self, path: &str) -> Result<ModelMetadata> {
        Self::model_metadata_with(&self.client, &self.base_url(), path).await
    }

    /// Same request as [`ServerProcess::model_metadata`], but taking a cloned client
    /// and base url like [`ServerProcess::transcribe_stream`] does, so callers can
    /// release the `ServerState` mutex before the round trip.
    pub async fn model_metadata_with(client: &reqwest::Client, base_url: &str, path: &str) -> Result<ModelMetadata> {
        let response = client
            .post(format!("{}/v1/models/metadata", base_url))
            .json(&serde_json::json!({ "path": path }))
            .send()
            .await
            .context("failed to request model metadata")?;
        if !response.status().is_success() {
            bail!(
                "vibe-server model metadata failed: {}",
                response.text().await.unwrap_or_default()
            );
        }
        response.json().await.context("failed to parse model metadata")
    }

    /// Built per attempt: the file part is a stream, so a retry needs a fresh
    /// form rather than a clone of the consumed one.
    async fn transcribe_form(options: &crate::cmd::TranscribeOptions) -> Result<multipart::Form> {
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
        // 0 is the UI's "unset"; 1 is a real request for one segment per word, so it has
        // to reach server rather than being filtered out with it.
        if let Some(value) = options.max_sentence_len.filter(|value| *value > 0) {
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

        Ok(form)
    }

    pub async fn transcribe_stream(
        client: &reqwest::Client,
        base_url: &str,
        options: &crate::cmd::TranscribeOptions,
    ) -> Result<impl futures_util::Stream<Item = Result<ServerEvent>>> {
        let url = format!("{}/v1/audio/transcriptions", base_url);

        // A pooled connection the server has already closed fails before the
        // request is ever seen, so one retry costs nothing and hides the race.
        // Transcription is a read, so replaying it is safe.
        let mut response = None;
        for attempt in 0..2 {
            let form = Self::transcribe_form(options).await?;
            match client.post(&url).multipart(form).send().await {
                Ok(ok) => {
                    response = Some(ok);
                    break;
                }
                Err(error) if attempt == 0 && is_connection_failure(&error) => {
                    tracing::warn!("retrying transcribe request after connection failure: {error}");
                }
                Err(error) => bail!("failed to send transcribe request to server: {error}"),
            }
        }
        let Some(response) = response else {
            bail!("failed to send transcribe request to server");
        };
        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            if let Ok(parsed) = serde_json::from_str::<ServerErrorResponse>(&body) {
                return Err(eyre::Report::new(ServerApiError {
                    code: parsed.error.code.unwrap_or_else(|| "internal_error".to_string()),
                    message: parsed.error.message,
                }));
            }
            bail!("vibe-server transcribe failed: {}", body);
        }

        let byte_stream = response.bytes_stream().map(|result| result.map_err(std::io::Error::other));
        Ok(decode_event_reader(StreamReader::new(byte_stream)))
    }
}
