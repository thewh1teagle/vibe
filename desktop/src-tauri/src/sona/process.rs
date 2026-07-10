use super::{ReadySignal, SonaProcess};
use eyre::{bail, Context, ContextCompat, Result};
use std::io::BufRead;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

impl SonaProcess {
    pub fn spawn(binary_path: &Path, ffmpeg_path: Option<&Path>) -> Result<Self> {
        tracing::debug!("spawning sona at {}", binary_path.display());
        let mut cmd = Command::new(binary_path);
        cmd.args(["serve", "--port", "0"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(ffmpeg) = ffmpeg_path {
            tracing::debug!("setting SONA_FFMPEG_PATH={}", ffmpeg.display());
            cmd.env("SONA_FFMPEG_PATH", ffmpeg);
        }
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let mut child = cmd.spawn().context("failed to spawn sona binary")?;
        let mut stderr = child.stderr.take();
        let stdout = child.stdout.take().context("failed to get sona stdout")?;
        let mut reader = std::io::BufReader::new(stdout);
        let mut line = String::new();
        let mut read_stderr = || -> String {
            let Some(stderr) = stderr.take() else {
                return String::new();
            };
            let mut output = String::new();
            let _ = std::io::BufReader::new(stderr).read_line(&mut output);
            output.truncate(4096);
            output
        };

        if let Err(error) = reader.read_line(&mut line) {
            let stderr_output = read_stderr();
            if stderr_output.is_empty() {
                return Err(error).context("failed to read sona ready signal");
            }
            bail!(
                "failed to read sona ready signal: {error}\n\nsona stderr: {}",
                stderr_output.trim()
            );
        }
        let signal: ReadySignal = serde_json::from_str(line.trim()).map_err(|error| {
            let stderr_output = read_stderr();
            if stderr_output.is_empty() {
                eyre::eyre!("failed to parse sona ready signal: {error}")
            } else {
                eyre::eyre!(
                    "failed to parse sona ready signal: {error}\n\nsona stderr: {}",
                    stderr_output.trim()
                )
            }
        })?;
        tracing::debug!("sona ready on port {}", signal.port);

        std::thread::spawn(move || {
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap_or(0) > 0 {
                tracing::trace!("sona stdout: {}", line.trim());
                line.clear();
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
            client: reqwest::Client::builder().no_proxy().build().unwrap(),
            stderr_buf,
        })
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub fn client(&self) -> reqwest::Client {
        self.client.clone()
    }

    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    fn recent_stderr(&self) -> String {
        self.stderr_buf.lock().map(|buf| buf.trim().to_string()).unwrap_or_default()
    }

    pub async fn load_model(&mut self, path: &str, gpu_device: Option<i32>, no_gpu: bool) -> Result<()> {
        let url = format!("{}/v1/models/load", self.base_url());
        let mut body = serde_json::json!({"path": path});
        if let Some(device) = gpu_device {
            body["gpu_device"] = serde_json::json!(device);
        }
        if no_gpu {
            body["no_gpu"] = serde_json::json!(true);
        }

        let mut last_error = None;
        for attempt in 0..3 {
            if attempt > 0 {
                if !self.is_alive() {
                    let stderr = self.recent_stderr();
                    if stderr.is_empty() {
                        bail!("sona process died during model loading");
                    }
                    bail!("sona process died during model loading\n\nsona stderr: {stderr}");
                }
                tracing::debug!("retrying load_model (attempt {})", attempt + 1);
                tokio::time::sleep(std::time::Duration::from_millis(500 * (1 << attempt))).await;
            }
            match self.client.post(&url).json(&body).send().await {
                Ok(response) if response.status().is_success() => {
                    tracing::debug!("sona model loaded: {path}");
                    return Ok(());
                }
                Ok(response) => bail!("sona load_model failed: {}", response.text().await.unwrap_or_default()),
                Err(error) => last_error = Some(error),
            }
        }

        let error = Err(last_error.unwrap()).context("failed to send load_model request to sona after 3 attempts");
        let stderr = self.recent_stderr();
        if stderr.is_empty() {
            error
        } else {
            error.context(format!("sona stderr: {stderr}"))
        }
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
