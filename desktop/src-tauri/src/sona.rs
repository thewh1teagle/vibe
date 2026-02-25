use eyre::{bail, Context, ContextCompat, Result};
use futures_util::StreamExt;
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GpuDevice {
    pub index: i32,
    pub name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub device_type: String,
}
use tokio_util::io::ReaderStream;

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
        message: String,
    },
}

impl SonaProcess {
    pub fn spawn(binary_path: &Path, ffmpeg_path: Option<&Path>, diarize_path: Option<&Path>) -> Result<Self> {
        tracing::debug!("spawning sona at {}", binary_path.display());

        let mut cmd = Command::new(binary_path);
        let args = vec!["serve", "--port", "0"];
        cmd.args(&args).stdout(Stdio::piped()).stderr(Stdio::piped());

        if let Some(ffmpeg) = ffmpeg_path {
            tracing::debug!("setting SONA_FFMPEG_PATH={}", ffmpeg.display());
            cmd.env("SONA_FFMPEG_PATH", ffmpeg);
        }

        if let Some(diarize) = diarize_path {
            tracing::debug!("setting SONA_DIARIZE_PATH={}", diarize.display());
            cmd.env("SONA_DIARIZE_PATH", diarize);
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut child = cmd.spawn().context("failed to spawn sona binary")?;

        let mut stderr = child.stderr.take();
        let stdout = child.stdout.take().context("failed to get sona stdout")?;
        let mut reader = std::io::BufReader::new(stdout);
        let mut line = String::new();

        let mut read_stderr = || -> String {
            let Some(s) = stderr.take() else { return String::new() };
            let mut buf = String::new();
            let mut r = std::io::BufReader::new(s);
            // Read first line of stderr for diagnostics
            let _ = r.read_line(&mut buf);
            buf.truncate(4096);
            buf
        };

        if let Err(e) = reader.read_line(&mut line) {
            let stderr_output = read_stderr();
            if stderr_output.is_empty() {
                return Err(e).context("failed to read sona ready signal");
            }
            bail!(
                "failed to read sona ready signal: {}\n\nsona stderr: {}",
                e,
                stderr_output.trim()
            );
        }

        let signal: ReadySignal = match serde_json::from_str(line.trim()) {
            Ok(s) => s,
            Err(e) => {
                let stderr_output = read_stderr();
                if stderr_output.is_empty() {
                    bail!("failed to parse sona ready signal: {}", e);
                }
                bail!(
                    "failed to parse sona ready signal: {}\n\nsona stderr: {}",
                    e,
                    stderr_output.trim()
                );
            }
        };

        tracing::debug!("sona ready on port {}", signal.port);

        // Spawn threads to consume remaining stdout/stderr so the pipes don't block
        std::thread::spawn(move || {
            let mut buf = String::new();
            while reader.read_line(&mut buf).unwrap_or(0) > 0 {
                tracing::trace!("sona stdout: {}", buf.trim());
                buf.clear();
            }
        });
        let stderr_buf = Arc::new(Mutex::new(String::new()));
        if let Some(stderr) = stderr {
            let buf_clone = stderr_buf.clone();
            std::thread::spawn(move || {
                let mut reader = std::io::BufReader::new(stderr);
                let mut line = String::new();
                while reader.read_line(&mut line).unwrap_or(0) > 0 {
                    tracing::debug!("sona stderr: {}", line.trim());
                    if let Ok(mut buf) = buf_clone.lock() {
                        if buf.len() < 8192 {
                            buf.push_str(&line);
                        }
                    }
                    line.clear();
                }
            });
        }

        Ok(Self {
            port: signal.port,
            child,
            // Bypass system proxy for localhost (avoids corporate proxy blocking sona requests)
            client: reqwest::Client::builder().no_proxy().build().unwrap(),
            stderr_buf,
        })
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    fn recent_stderr(&self) -> String {
        self.stderr_buf.lock().map(|b| b.trim().to_string()).unwrap_or_default()
    }

    pub async fn load_model(&mut self, path: &str, gpu_device: Option<i32>, no_gpu: bool) -> Result<()> {
        let url = format!("{}/v1/models/load", self.base_url());
        let mut body = serde_json::json!({"path": path});
        if let Some(dev) = gpu_device {
            body["gpu_device"] = serde_json::json!(dev);
        }
        if no_gpu {
            body["no_gpu"] = serde_json::json!(true);
        }
        let mut last_err = None;
        for attempt in 0..3 {
            if attempt > 0 {
                if !self.is_alive() {
                    let stderr = self.recent_stderr();
                    if stderr.is_empty() {
                        bail!("sona process died during model loading");
                    }
                    bail!("sona process died during model loading\n\nsona stderr: {}", stderr);
                }
                tracing::debug!("retrying load_model (attempt {})", attempt + 1);
                tokio::time::sleep(std::time::Duration::from_millis(500 * (1 << attempt))).await;
            }
            match self.client.post(&url).json(&body).send().await {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        let body = resp.text().await.unwrap_or_default();
                        bail!("sona load_model failed: {}", body);
                    }
                    tracing::debug!("sona model loaded: {}", path);
                    return Ok(());
                }
                Err(e) => {
                    last_err = Some(e);
                }
            }
        }
        let stderr = self.recent_stderr();
        let base_err = Err(last_err.unwrap()).context("failed to send load_model request to sona after 3 attempts");
        if stderr.is_empty() {
            base_err
        } else {
            base_err.context(format!("sona stderr: {}", stderr))
        }
    }

    pub async fn transcribe_stream(
        &self,
        options: &crate::cmd::TranscribeOptions,
    ) -> Result<impl futures_util::Stream<Item = Result<SonaEvent>>> {
        let url = format!("{}/v1/audio/transcriptions", self.base_url());

        let file = tokio::fs::File::open(&options.path)
            .await
            .context("failed to open audio file")?;
        let file_len = file.metadata().await.context("failed to read file metadata")?.len();

        let file_name = Path::new(&options.path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let stream = ReaderStream::new(file);
        let body = reqwest::Body::wrap_stream(stream);

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
        if let Some(ref p) = options.init_prompt {
            if !p.is_empty() {
                form = form.text("prompt", p.clone());
            }
        }
        if let Some(n) = options.n_threads {
            if n > 0 {
                form = form.text("n_threads", n.to_string());
            }
        }
        if let Some(t) = options.temperature {
            if t > 0.0 {
                form = form.text("temperature", t.to_string());
            }
        }
        if let Some(n) = options.max_text_ctx {
            if n > 0 {
                form = form.text("max_text_ctx", n.to_string());
            }
        }
        if options.word_timestamps.unwrap_or(false) {
            form = form.text("word_timestamps", "true");
        }
        if let Some(n) = options.max_sentence_len {
            if n > 0 {
                form = form.text("max_segment_len", n.to_string());
            }
        }
        if let Some(ref strategy) = options.sampling_strategy {
            if strategy == "beam search" {
                form = form.text("sampling_strategy", "beam_search".to_string());
            }
        }
        if let Some(n) = options.best_of {
            if n > 0 {
                form = form.text("best_of", n.to_string());
            }
        }
        if let Some(n) = options.beam_size {
            if n > 0 {
                form = form.text("beam_size", n.to_string());
            }
        }
        if let Some(ref model) = options.diarize_model {
            if !model.is_empty() {
                form = form.text("diarize_model", model.clone());
            }
        }

        let resp = self
            .client
            .post(&url)
            .multipart(form)
            .send()
            .await
            .context("failed to send transcribe request to sona")?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            bail!("sona transcribe failed: {}", body);
        }

        let stream = resp.bytes_stream().map(move |chunk_result| {
            let chunk = chunk_result.context("error reading sona stream chunk")?;
            // ndjson: each line is a JSON object
            let text = String::from_utf8_lossy(&chunk);
            let mut events = Vec::new();
            for line in text.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                match serde_json::from_str::<SonaEvent>(line) {
                    Ok(event) => events.push(event),
                    Err(e) => {
                        tracing::warn!("failed to parse sona event: {} (line: {})", e, line);
                    }
                }
            }
            Ok(events)
        });

        // Flatten Vec<SonaEvent> into individual SonaEvent items
        let flat_stream = stream.flat_map(|result: Result<Vec<SonaEvent>>| {
            let items: Vec<Result<SonaEvent>> = match result {
                Ok(events) => events.into_iter().map(Ok).collect(),
                Err(e) => vec![Err(e)],
            };
            futures_util::stream::iter(items)
        });

        Ok(flat_stream)
    }

    pub fn kill(&mut self) {
        tracing::debug!("killing sona process");
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Runs `sona devices` to list GPU devices without needing a running server.
pub fn list_gpu_devices(binary_path: &Path) -> Result<Vec<GpuDevice>> {
    let output = Command::new(binary_path)
        .args(["devices"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .context("failed to run sona devices")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("sona devices failed: {}", stderr.trim());
    }

    let devices: Vec<GpuDevice> = serde_json::from_slice(&output.stdout).context("failed to parse sona devices output")?;
    Ok(devices)
}

impl Drop for SonaProcess {
    fn drop(&mut self) {
        self.kill();
    }
}
