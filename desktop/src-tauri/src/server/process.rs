use super::{ReadySignal, ServerProcess, StderrTail};
use eyre::{bail, Context, ContextCompat, Result};
use std::io::BufRead;
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// A sidecar that hangs before printing its ready line used to block the calling
/// thread forever; fail with a clear error instead.
const READY_TIMEOUT: Duration = Duration::from_secs(60);
/// `try_wait` can see the child gone before the reader thread has drained the
/// pipe, so death paths wait this long for the collector to reach EOF.
const STDERR_DRAIN_TIMEOUT: Duration = Duration::from_millis(500);
const STDERR_POLL_INTERVAL: Duration = Duration::from_millis(20);
/// How long a death report waits for a child whose output already broke to become reapable.
const EXIT_GRACE: Duration = Duration::from_secs(2);
/// Nothing on a connection can go idle longer than this before we throw it away.
/// Shorter than any idle close on the server side, so a request is never handed a
/// socket the server has already dropped.
const POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(15);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const TCP_KEEPALIVE: Duration = Duration::from_secs(15);

/// How the child died, in the most diagnostic terms the platform offers. On Unix
/// the termination signal is the single most useful bit (SIGKILL is the OOM
/// killer or a sandbox, SIGABRT/SIGILL is ggml giving up), and it is only
/// reachable through `ExitStatusExt`.
pub(super) fn describe_exit(status: ExitStatus) -> String {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(signal) = status.signal() {
            let core = if status.core_dumped() { ", core dumped" } else { "" };
            return match signal_name(signal) {
                Some(name) => format!("killed by signal {signal} ({name}{core})"),
                None => format!("killed by signal {signal}{core}"),
            };
        }
    }
    match status.code() {
        Some(code) => format!("exited with code {code}"),
        None => format!("exited: {status}"),
    }
}

/// An illegal instruction from a binary that runs everywhere else means the CPU is
/// missing an instruction set the build assumes. Naming it here is what turns these
/// reports from a bare "vibe-server process died" into something identifiable.
fn illegal_instruction_hint(status: ExitStatus) -> Option<&'static str> {
    const MESSAGE: &str = "This looks like a CPU without AVX support: server picks an AVX2 or an AVX build of its CPU backend at startup, but nothing older, so it stops on the first instruction it cannot run. Vibe cannot transcribe on this machine.";

    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if status.signal() == Some(4) {
            return Some(MESSAGE);
        }
    }
    #[cfg(windows)]
    {
        // STATUS_ILLEGAL_INSTRUCTION, which Windows surfaces as the exit code.
        if status.code() == Some(0xC000_001D_u32 as i32) {
            return Some(MESSAGE);
        }
    }
    let _ = status;
    None
}

#[cfg(unix)]
fn signal_name(signal: i32) -> Option<&'static str> {
    #[cfg(target_os = "linux")]
    const SIGBUS: i32 = 7;
    #[cfg(not(target_os = "linux"))]
    const SIGBUS: i32 = 10;

    Some(match signal {
        1 => "SIGHUP",
        2 => "SIGINT",
        3 => "SIGQUIT",
        4 => "SIGILL",
        5 => "SIGTRAP",
        6 => "SIGABRT",
        8 => "SIGFPE",
        9 => "SIGKILL",
        11 => "SIGSEGV",
        13 => "SIGPIPE",
        14 => "SIGALRM",
        15 => "SIGTERM",
        24 => "SIGXCPU",
        25 => "SIGXFSZ",
        signal if signal == SIGBUS => "SIGBUS",
        _ => return None,
    })
}

fn stderr_snapshot(stderr: &Arc<Mutex<StderrTail>>) -> String {
    stderr.lock().map(|tail| tail.snapshot()).unwrap_or_default()
}

fn stderr_finished(stderr: &Arc<Mutex<StderrTail>>) -> bool {
    // A poisoned mutex means the collector thread panicked: no more output is
    // coming, so treat it as finished rather than waiting out the timeout.
    stderr.lock().map(|tail| tail.is_finished()).unwrap_or(true)
}

/// Blocking counterpart of [`ServerProcess::stderr_after_exit`], for the spawn path
/// (which is not async).
fn wait_for_stderr_blocking(stderr: &Arc<Mutex<StderrTail>>) -> String {
    let deadline = Instant::now() + STDERR_DRAIN_TIMEOUT;
    while !stderr_finished(stderr) && Instant::now() < deadline {
        std::thread::sleep(STDERR_POLL_INTERVAL);
    }
    stderr_snapshot(stderr)
}

fn build_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(CONNECT_TIMEOUT)
        .pool_idle_timeout(POOL_IDLE_TIMEOUT)
        .tcp_keepalive(TCP_KEEPALIVE)
        // Deliberately no blanket request `timeout`: a transcription streams for
        // as long as the audio takes, and a whole-request deadline would cut off
        // exactly the long jobs that matter most.
        .build()
        .context("failed to build server http client")
}

impl ServerProcess {
    pub fn spawn(binary_path: &Path, ffmpeg_path: Option<&Path>, unload_timeout_minutes: u32) -> Result<Self> {
        tracing::debug!("spawning server at {}", binary_path.display());
        let unload_timeout = if unload_timeout_minutes == 0 {
            "0".to_string()
        } else {
            format!("{unload_timeout_minutes}m")
        };
        let mut cmd = Command::new(binary_path);
        cmd.args(["serve", "--port", "0"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("VIBE_SERVER_UNLOAD_TIMEOUT", unload_timeout)
            // ggml_print_backtrace forks gdb/lldb on abort, which can hang the
            // dying child and produces nothing useful in a shipped build.
            .env("GGML_NO_BACKTRACE", "1");
        // Whatever server logs at warn/error is our only window into a crash, so ask
        // for it — without clobbering a level the user set deliberately.
        if std::env::var_os("RUST_LOG").is_none() {
            cmd.env("RUST_LOG", "warn");
        }

        if let Some(ffmpeg) = ffmpeg_path {
            tracing::debug!("setting VIBE_SERVER_FFMPEG_PATH={}", ffmpeg.display());
            cmd.env("VIBE_SERVER_FFMPEG_PATH", ffmpeg);
        }
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let mut child = cmd.spawn().context("failed to spawn server binary")?;
        let stderr = child.stderr.take();
        let stdout = child.stdout.take().context("failed to get server stdout")?;

        // Start the collector before the handshake. Reading the pipe inline here
        // instead would leave the collector with nothing to read for the rest of
        // the process's life, so every later crash would report empty stderr.
        let stderr_buf = Arc::new(Mutex::new(StderrTail::default()));
        if let Some(stderr) = stderr {
            let buf_clone = stderr_buf.clone();
            std::thread::spawn(move || {
                let mut reader = std::io::BufReader::new(stderr);
                let mut line = String::new();
                loop {
                    match reader.read_line(&mut line) {
                        Ok(0) => break,
                        Ok(_) => {
                            tracing::debug!("vibe-server stderr: {}", line.trim());
                            if let Ok(mut buf) = buf_clone.lock() {
                                buf.push(&line);
                            }
                            line.clear();
                        }
                        // Invalid UTF-8 used to end this loop silently; say so
                        // instead, otherwise the tail looks merely empty.
                        Err(error) => {
                            if let Ok(mut buf) = buf_clone.lock() {
                                buf.finish(Some(error.to_string()));
                            }
                            return;
                        }
                    }
                }
                if let Ok(mut buf) = buf_clone.lock() {
                    buf.finish(None);
                }
            });
        } else if let Ok(mut buf) = stderr_buf.lock() {
            buf.finish(None);
        }

        // The ready line is read on its own thread so the wait can be bounded; the
        // same thread goes on to drain stdout for the rest of the run.
        let (ready_tx, ready_rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stdout);
            let mut line = String::new();
            let first = reader.read_line(&mut line).map(|_| std::mem::take(&mut line));
            if ready_tx.send(first).is_err() {
                return;
            }
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap_or(0) > 0 {
                tracing::trace!("vibe-server stdout: {}", line.trim());
                line.clear();
            }
        });

        let line = match ready_rx.recv_timeout(READY_TIMEOUT) {
            Ok(Ok(line)) => line,
            Ok(Err(error)) => {
                let detail = kill_and_describe(&mut child, &stderr_buf);
                bail!("failed to read server ready signal: {error}{detail}");
            }
            Err(_) => {
                let detail = kill_and_describe(&mut child, &stderr_buf);
                bail!(
                    "timed out after {}s waiting for server to report it was ready{detail}",
                    READY_TIMEOUT.as_secs()
                );
            }
        };
        // An empty first line means stdout hit EOF: the child is already gone.
        if line.trim().is_empty() {
            let detail = kill_and_describe(&mut child, &stderr_buf);
            bail!("vibe-server exited before reporting it was ready{detail}");
        }

        let signal: ReadySignal = match serde_json::from_str(line.trim()) {
            Ok(signal) => signal,
            Err(error) => {
                let detail = kill_and_describe(&mut child, &stderr_buf);
                bail!("failed to parse server ready signal: {error}{detail}");
            }
        };
        tracing::debug!("vibe-server ready on port {}", signal.port);

        Ok(Self {
            port: signal.port,
            unload_timeout_minutes,
            child,
            exit_status: None,
            client: build_client()?,
            stderr_buf,
        })
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub fn client(&self) -> reqwest::Client {
        self.client.clone()
    }

    /// `try_wait` reports the status exactly once and then forgets it, so the
    /// result is cached: every later death report can still name the exit code
    /// and the signal.
    pub fn exit_status(&mut self) -> Option<ExitStatus> {
        if self.exit_status.is_none() {
            if let Ok(Some(status)) = self.child.try_wait() {
                self.exit_status = Some(status);
            }
        }
        self.exit_status
    }

    pub fn is_alive(&mut self) -> bool {
        self.exit_status().is_none()
    }

    pub fn unload_timeout_minutes(&self) -> u32 {
        self.unload_timeout_minutes
    }

    /// Bounded wait for the collector to reach EOF before snapshotting: the child
    /// being reaped does not mean its output has been read yet.
    async fn stderr_after_exit(&self) -> String {
        let deadline = Instant::now() + STDERR_DRAIN_TIMEOUT;
        while !stderr_finished(&self.stderr_buf) && Instant::now() < deadline {
            tokio::time::sleep(STDERR_POLL_INTERVAL).await;
        }
        stderr_snapshot(&self.stderr_buf)
    }

    pub fn recent_stderr(&self) -> String {
        stderr_snapshot(&self.stderr_buf)
    }

    /// `Some(message)` when the child is gone, describing how it died and what it
    /// last printed. `None` while it is still running.
    ///
    /// A broken response stream reaches the caller a few milliseconds before the
    /// child is reapable, so a short wait here is what turns "error decoding
    /// response body" into the exit code and the stderr that explain it.
    pub async fn death_report(&mut self, context: &str) -> Option<String> {
        let deadline = Instant::now() + EXIT_GRACE;
        let status = loop {
            if let Some(status) = self.exit_status() {
                break status;
            }
            if Instant::now() >= deadline {
                return None;
            }
            tokio::time::sleep(STDERR_POLL_INTERVAL).await;
        };
        let stderr = self.stderr_after_exit().await;
        let mut message = format!("{context} ({})", describe_exit(status));
        if let Some(hint) = illegal_instruction_hint(status) {
            message.push_str(&format!("\n\n{hint}"));
        }
        if !stderr.is_empty() {
            message.push_str(&format!("\n\nvibe-server stderr: {stderr}"));
        }
        Some(message)
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
                if let Some(report) = self.death_report("vibe-server process died during model loading").await {
                    bail!("{report}");
                }
                tracing::debug!("retrying load_model (attempt {})", attempt + 1);
                tokio::time::sleep(std::time::Duration::from_millis(500 * (1 << attempt))).await;
            }
            match self.client.post(&url).json(&body).send().await {
                Ok(response) if response.status().is_success() => {
                    tracing::debug!("vibe-server model loaded: {path}");
                    return Ok(());
                }
                Ok(response) => bail!("vibe-server load_model failed: {}", response.text().await.unwrap_or_default()),
                Err(error) => last_error = Some(error),
            }
        }

        if let Some(report) = self.death_report("vibe-server process died during model loading").await {
            bail!("{report}");
        }
        let error = Err(last_error.unwrap()).context("failed to send load_model request to server after 3 attempts");
        let stderr = self.recent_stderr();
        if stderr.is_empty() {
            error
        } else {
            error.context(format!("vibe-server stderr: {stderr}"))
        }
    }

    pub fn kill(&mut self) {
        tracing::debug!("killing server process");
        if self.exit_status().is_some() {
            return;
        }
        let _ = self.child.kill();
        if let Ok(status) = self.child.wait() {
            self.exit_status = Some(status);
        }
    }
}

/// Give up on a child that never handed us a usable ready line, and describe how
/// it went: its exit status if it died on its own, plus whatever it printed. The
/// status is only worth reporting when it was not us who ended it.
fn kill_and_describe(child: &mut Child, stderr_buf: &Arc<Mutex<StderrTail>>) -> String {
    let status = match child.try_wait() {
        Ok(Some(status)) => Some(status),
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
    };
    let mut detail = String::new();
    if let Some(status) = status {
        detail.push_str(&format!(" (server {})", describe_exit(status)));
    }
    let stderr = wait_for_stderr_blocking(stderr_buf);
    if !stderr.is_empty() {
        detail.push_str(&format!("\n\nvibe-server stderr: {stderr}"));
    }
    detail
}

impl Drop for ServerProcess {
    fn drop(&mut self) {
        self.kill();
    }
}
