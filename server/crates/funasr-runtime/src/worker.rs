use std::env;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, ensure, Context, Result};
use serde::{Deserialize, Serialize};
use tempfile::NamedTempFile;

use crate::manifest::{ModelKind, Package};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(120);
const INFERENCE_TIMEOUT: Duration = Duration::from_secs(600);
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const MAX_STDOUT_LINE: usize = 1024 * 1024;
const MAX_STDERR_TAIL: usize = 16 * 1024;
const MAX_SAMPLES: usize = 480_000;
const MIN_SAMPLES: usize = 400;
const EVENT_CAPACITY: usize = 8;

type StderrTail = Arc<Mutex<Vec<u8>>>;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
enum Message {
    Ready { protocol: u64, engine: String },
    Result { id: u64, text: String },
    Error { id: u64, message: String },
}

enum Event {
    Message(Message),
    Failed(String),
    Eof,
}

#[derive(Serialize)]
struct Request<'a> {
    id: u64,
    audio_path: &'a str,
}

pub struct Worker {
    child: Child,
    live: bool,
    events: Option<Receiver<Event>>,
    requests: Option<SyncSender<Vec<u8>>>,
    threads: Vec<JoinHandle<()>>,
    stderr: StderrTail,
    next_id: u64,
    inference_timeout: Duration,
}

impl Worker {
    pub fn load(package: &Package, gpu_device: i32) -> Result<Self> {
        Self::spawn(
            &worker_executable(package.kind)?,
            package,
            gpu_device,
            STARTUP_TIMEOUT,
            INFERENCE_TIMEOUT,
        )
    }

    fn spawn(
        executable: &Path,
        package: &Package,
        gpu_device: i32,
        startup_timeout: Duration,
        inference_timeout: Duration,
    ) -> Result<Self> {
        let deadline = Instant::now() + startup_timeout;
        ensure!(
            (-1..=15).contains(&gpu_device),
            "gpu_device must be -1 (CPU) or a GPU index 0..=15"
        );
        let mut command = Command::new(executable);
        command.arg("--model").arg(&package.model);
        if let Some(encoder) = &package.encoder {
            command.arg("--encoder").arg(encoder);
        }
        // Omitted on the CPU default so the worker's argv stays minimal.
        if gpu_device >= 0 {
            command.arg("--device").arg(gpu_device.to_string());
        }
        let child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| format!("cannot start ASR worker {}", executable.display()))?;
        let mut worker = Self {
            child,
            live: true,
            events: None,
            requests: None,
            threads: Vec::new(),
            stderr: Arc::new(Mutex::new(Vec::with_capacity(MAX_STDERR_TAIL))),
            next_id: 1,
            inference_timeout,
        };
        let result = (|| {
            worker.start_threads()?;
            match worker.receive(deadline, &mut || false, "startup")? {
                Message::Ready { protocol, engine } => {
                    ensure!(protocol == 1, "unsupported worker protocol: {protocol}");
                    ensure!(
                        engine == engine_name(package.kind),
                        "worker engine mismatch: expected {}, received {engine}",
                        engine_name(package.kind)
                    );
                    Ok(())
                }
                _ => bail!("worker protocol error: expected ready message"),
            }
        })();
        if let Err(error) = result {
            return Err(worker.fail(error));
        }
        Ok(worker)
    }

    fn start_threads(&mut self) -> Result<()> {
        let stdout = self.child.stdout.take().context("missing worker stdout")?;
        let stderr = self.child.stderr.take().context("missing worker stderr")?;
        let stdin = self.child.stdin.take().context("missing worker stdin")?;
        let (event_tx, event_rx) = mpsc::sync_channel(EVENT_CAPACITY);
        let (request_tx, request_rx) = mpsc::sync_channel::<Vec<u8>>(1);
        self.events = Some(event_rx);
        self.requests = Some(request_tx);
        let reader_tx = event_tx.clone();
        self.threads.push(
            thread::Builder::new()
                .name("asr-worker-stdout".into())
                .spawn(move || read_stdout(stdout, reader_tx))
                .context("cannot start worker stdout reader")?,
        );
        let tail = Arc::clone(&self.stderr);
        self.threads.push(
            thread::Builder::new()
                .name("asr-worker-stderr".into())
                .spawn(move || read_stderr(stderr, tail))
                .context("cannot start worker stderr reader")?,
        );
        self.threads.push(
            thread::Builder::new()
                .name("asr-worker-stdin".into())
                .spawn(move || {
                    let mut stdin = stdin;
                    for request in request_rx {
                        if let Err(error) = stdin.write_all(&request).and_then(|_| stdin.flush()) {
                            let _ = event_tx.send(Event::Failed(format!("cannot write worker request: {error}")));
                            break;
                        }
                    }
                })
                .context("cannot start worker stdin writer")?,
        );
        Ok(())
    }

    pub fn transcribe(&mut self, samples: &[f32], should_abort: &mut dyn FnMut() -> bool) -> Result<String> {
        let deadline = Instant::now() + self.inference_timeout;
        ensure!(self.is_alive(), "ASR worker is not alive; reload it before the next task");
        let audio = write_audio(samples, deadline, should_abort).map_err(|error| self.fail(error))?;
        let result = self.transcribe_file(&audio, deadline, should_abort);
        result.map_err(|error| self.fail(error))
    }

    fn transcribe_file(
        &mut self,
        audio: &NamedTempFile,
        deadline: Instant,
        should_abort: &mut dyn FnMut() -> bool,
    ) -> Result<String> {
        check_interrupt(deadline, should_abort, "transcription")?;
        let events = self.events.as_ref().context("worker stdout is closed")?;
        match events.try_recv() {
            Err(TryRecvError::Empty) => {}
            Err(TryRecvError::Disconnected) | Ok(Event::Eof) => bail!("worker stdout reached EOF"),
            Ok(Event::Failed(error)) => bail!("{error}"),
            Ok(Event::Message(_)) => bail!("worker protocol error: unsolicited message"),
        }
        let id = self.next_id;
        self.next_id = id.checked_add(1).context("worker request ID exhausted")?;
        let request = Request {
            id,
            audio_path: audio.path().to_str().context("audio path is not valid UTF-8")?,
        };
        let mut bytes = serde_json::to_vec(&request).context("cannot encode worker request")?;
        bytes.push(b'\n');
        self.requests
            .as_ref()
            .context("worker stdin is closed")?
            .try_send(bytes)
            .map_err(|error| anyhow!("cannot queue worker request: {error}"))?;
        match self.receive(deadline, should_abort, "transcription")? {
            Message::Result { id: received, text } => {
                ensure!(received == id, "worker protocol error: expected ID {id}, received {received}");
                Ok(text)
            }
            Message::Error { id: received, message } => {
                ensure!(received == id, "worker protocol error: expected ID {id}, received {received}");
                bail!("ASR worker error: {message}")
            }
            Message::Ready { .. } => bail!("worker protocol error: unexpected ready message"),
        }
    }

    fn receive(&self, deadline: Instant, should_abort: &mut dyn FnMut() -> bool, operation: &str) -> Result<Message> {
        let events = self.events.as_ref().context("worker stdout is closed")?;
        loop {
            check_interrupt(deadline, should_abort, operation)?;
            let wait = POLL_INTERVAL.min(deadline.saturating_duration_since(Instant::now()));
            match events.recv_timeout(wait) {
                Ok(event) => {
                    check_interrupt(deadline, should_abort, operation)?;
                    return match event {
                        Event::Message(message) => Ok(message),
                        Event::Failed(error) => Err(anyhow!(error)),
                        Event::Eof => Err(anyhow!("worker stdout reached EOF")),
                    };
                }
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => bail!("worker stdout reached EOF"),
            }
        }
    }

    pub fn is_alive(&mut self) -> bool {
        if !self.live {
            return false;
        }
        match self.child.try_wait() {
            Ok(None) => true,
            Ok(Some(_)) | Err(_) => {
                self.shutdown();
                false
            }
        }
    }

    fn fail(&mut self, error: anyhow::Error) -> anyhow::Error {
        self.shutdown();
        let tail = self.stderr.lock().unwrap_or_else(|error| error.into_inner());
        if tail.is_empty() {
            error
        } else {
            anyhow!("{error:#}\nworker stderr (tail): {}", String::from_utf8_lossy(&tail))
        }
    }

    fn shutdown(&mut self) {
        // Disconnect bounded channels before joining their potentially blocked senders.
        self.events.take();
        self.requests.take();
        self.child.stdin.take();
        self.child.stdout.take();
        self.child.stderr.take();
        if self.live {
            self.live = false;
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
        for thread in self.threads.drain(..) {
            let _ = thread.join();
        }
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn engine_name(kind: ModelKind) -> &'static str {
    match kind {
        ModelKind::FunAsrNano => "funasr-nano",
        ModelKind::SenseVoice => "sensevoice",
    }
}

fn worker_executable(kind: ModelKind) -> Result<PathBuf> {
    let directory = match env::var_os("VIBE_FUNASR_WORKER_DIR") {
        Some(directory) => {
            ensure!(!directory.is_empty(), "VIBE_FUNASR_WORKER_DIR must not be empty");
            let directory = PathBuf::from(directory);
            if directory.is_absolute() {
                directory
            } else {
                env::current_dir().context("cannot resolve worker directory")?.join(directory)
            }
        }
        None => env::current_exe()
            .context("cannot locate current executable")?
            .parent()
            .context("current executable has no parent directory")?
            .to_path_buf(),
    };
    Ok(directory.join(format!("vibe-{}-worker{}", engine_name(kind), env::consts::EXE_SUFFIX)))
}

fn check_interrupt(deadline: Instant, should_abort: &mut dyn FnMut() -> bool, operation: &str) -> Result<()> {
    ensure!(!should_abort(), "ASR worker {operation} cancelled");
    ensure!(Instant::now() < deadline, "ASR worker {operation} timed out");
    Ok(())
}

fn write_audio(samples: &[f32], deadline: Instant, should_abort: &mut dyn FnMut() -> bool) -> Result<NamedTempFile> {
    ensure!(
        samples.len() >= MIN_SAMPLES,
        "audio requires at least 400 samples at 16 kHz for fbank processing"
    );
    ensure!(
        samples.len() <= MAX_SAMPLES,
        "audio exceeds 480000 samples (30 seconds at 16 kHz)"
    );
    ensure!(
        samples.iter().all(|sample| sample.is_finite()),
        "audio contains NaN or infinite samples"
    );
    check_interrupt(deadline, should_abort, "transcription")?;
    let mut audio = NamedTempFile::new().context("cannot create private worker audio file")?;
    let mut buffer = [0_u8; 4096];
    for chunk in samples.chunks(buffer.len() / 4) {
        check_interrupt(deadline, should_abort, "transcription")?;
        for (sample, target) in chunk.iter().zip(buffer.chunks_exact_mut(4)) {
            target.copy_from_slice(&sample.to_le_bytes());
        }
        audio
            .write_all(&buffer[..chunk.len() * 4])
            .context("cannot write worker audio file")?;
    }
    audio.flush().context("cannot flush worker audio file")?;
    Ok(audio)
}

fn read_stdout(source: impl Read, sender: SyncSender<Event>) {
    let mut reader = BufReader::new(source);
    loop {
        let event = match read_message(&mut reader) {
            Ok(Some(message)) => Event::Message(message),
            Ok(None) => Event::Eof,
            Err(error) => Event::Failed(format!("worker protocol error: {error:#}")),
        };
        let terminal = !matches!(event, Event::Message(_));
        if sender.send(event).is_err() || terminal {
            break;
        }
    }
}

fn read_message(reader: &mut impl BufRead) -> Result<Option<Message>> {
    let mut line = Vec::new();
    loop {
        let available = match reader.fill_buf() {
            Ok(available) => available,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error).context("cannot read worker stdout"),
        };
        if available.is_empty() {
            ensure!(line.is_empty(), "worker stdout reached EOF with an unterminated line");
            return Ok(None);
        }
        let newline = available.iter().position(|byte| *byte == b'\n');
        let count = newline.unwrap_or(available.len());
        ensure!(line.len() + count <= MAX_STDOUT_LINE, "worker stdout line exceeds 1 MiB");
        line.extend_from_slice(&available[..count]);
        reader.consume(count + usize::from(newline.is_some()));
        if newline.is_some() {
            return serde_json::from_slice(&line)
                .map(Some)
                .context("invalid worker protocol JSON");
        }
    }
}

fn read_stderr(mut source: impl Read, tail: StderrTail) {
    let mut buffer = [0_u8; 4096];
    loop {
        let count = match source.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => count,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        };
        let mut tail = tail.lock().unwrap_or_else(|error| error.into_inner());
        let excess = (tail.len() + count).saturating_sub(MAX_STDERR_TAIL);
        tail.drain(..excess);
        tail.extend_from_slice(&buffer[..count]);
    }
}

#[cfg(all(test, unix))]
#[path = "worker_tests.rs"]
mod tests;
