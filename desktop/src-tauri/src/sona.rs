use eyre::{bail, Context, ContextCompat, Result};
use futures_util::StreamExt;
use reqwest::multipart;
use serde::Deserialize;
use std::io::BufRead;
use std::path::Path;
use std::process::{Child, Command, Stdio};

pub struct SonaProcess {
    port: u16,
    child: Child,
    client: reqwest::Client,
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
    Progress { progress: i32 },
    Segment { start: f64, end: f64, text: String },
    Result { text: String },
    Error { message: String },
}

impl SonaProcess {
    pub fn spawn(binary_path: &Path, ffmpeg_path: Option<&Path>) -> Result<Self> {
        tracing::debug!("spawning sona at {}", binary_path.display());

        let mut cmd = Command::new(binary_path);
        cmd.args(["serve", "--port", "0"])
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        if let Some(ffmpeg) = ffmpeg_path {
            tracing::debug!("setting SONA_FFMPEG_PATH={}", ffmpeg.display());
            cmd.env("SONA_FFMPEG_PATH", ffmpeg);
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut child = cmd.spawn().context("failed to spawn sona binary")?;

        let stdout = child.stdout.take().context("failed to get sona stdout")?;
        let mut reader = std::io::BufReader::new(stdout);
        let mut line = String::new();
        reader.read_line(&mut line).context("failed to read sona ready signal")?;

        let signal: ReadySignal = serde_json::from_str(line.trim()).context("failed to parse sona ready signal")?;

        tracing::debug!("sona ready on port {}", signal.port);

        // Spawn a thread to consume remaining stdout so the pipe doesn't block
        std::thread::spawn(move || {
            let mut buf = String::new();
            while reader.read_line(&mut buf).unwrap_or(0) > 0 {
                tracing::trace!("sona stdout: {}", buf.trim());
                buf.clear();
            }
        });

        Ok(Self {
            port: signal.port,
            child,
            client: reqwest::Client::new(),
        })
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub async fn load_model(&self, path: &str) -> Result<()> {
        let url = format!("{}/v1/models/load", self.base_url());
        let resp = self
            .client
            .post(&url)
            .json(&serde_json::json!({"path": path}))
            .send()
            .await
            .context("failed to send load_model request to sona")?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            bail!("sona load_model failed: {}", body);
        }
        tracing::debug!("sona model loaded: {}", path);
        Ok(())
    }

    pub async fn transcribe_stream(
        &self,
        file_path: &str,
        language: Option<&str>,
        translate: bool,
        prompt: Option<&str>,
    ) -> Result<impl futures_util::Stream<Item = Result<SonaEvent>>> {
        let url = format!("{}/v1/audio/transcriptions", self.base_url());

        let file_bytes = tokio::fs::read(file_path).await.context("failed to read audio file")?;

        let file_name = Path::new(file_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let file_part = multipart::Part::bytes(file_bytes)
            .file_name(file_name)
            .mime_str("application/octet-stream")?;

        let mut form = multipart::Form::new().part("file", file_part).text("stream", "true");

        if let Some(lang) = language {
            if !lang.is_empty() {
                form = form.text("language", lang.to_string());
            }
        }
        if translate {
            form = form.text("translate", "true");
        }
        if let Some(p) = prompt {
            if !p.is_empty() {
                form = form.text("prompt", p.to_string());
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

impl Drop for SonaProcess {
    fn drop(&mut self) {
        self.kill();
    }
}
