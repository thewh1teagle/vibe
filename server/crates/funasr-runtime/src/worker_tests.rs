use super::*;
use std::fs;
use std::io::Cursor;
use std::os::unix::fs::PermissionsExt;
use tempfile::TempDir;

const READY: &str = r#"printf '%s\n' '{"type":"ready","protocol":1,"engine":"sensevoice"}'"#;
const RESPOND: &str = r#"
while IFS= read -r request; do
    id=${request#*\"id\":}
    id=${id%%,*}
    audio=${request#*\"audio_path\":\"}
    audio=${audio%\"\}}
    printf '%s' "$audio" > "$model.path"
    cp "$audio" "$model.capture"
    printf '%s\n' "$id" >> "$model.ids"
    printf '{"type":"result","id":%s,"text":"识别 successful"}\n' "$id"
done
"#;

struct Fixture {
    _directory: TempDir,
    executable: PathBuf,
    package: Package,
}

impl Fixture {
    fn new(script: &str) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("fake-worker");
        fs::write(
            &executable,
            format!("#!/bin/sh\nset -eu\nmodel=$2\nprintf '%s' \"$$\" > \"$model.pid\"\n{script}\n"),
        )
        .unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
        let package = Package {
            kind: ModelKind::SenseVoice,
            model: directory.path().join("model weights.gguf"),
            encoder: None,
            revision: "test".into(),
        };
        Self {
            _directory: directory,
            executable,
            package,
        }
    }

    fn ready(body: &str) -> Self {
        Self::new(&format!("{READY}\n{body}"))
    }

    fn spawn(&self) -> Worker {
        // Generous on purpose: these timeouts are not what the tests assert, and a
        // fully parallel workspace run can delay /bin/sh's startup by seconds.
        self.spawn_with_timeouts(Duration::from_secs(10), Duration::from_secs(10))
            .unwrap()
    }

    fn spawn_with_timeouts(&self, startup: Duration, inference: Duration) -> Result<Worker> {
        Worker::spawn(&self.executable, &self.package, -1, startup, inference)
    }

    fn record(&self, suffix: &str) -> PathBuf {
        self.package.model.with_file_name(format!("model weights.gguf.{suffix}"))
    }

    fn pid(&self) -> u32 {
        fs::read_to_string(self.record("pid")).unwrap().parse().unwrap()
    }
}

fn process_exists(pid: u32) -> bool {
    Command::new("/bin/kill")
        .arg("-0")
        .arg(pid.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .unwrap()
        .success()
}

fn assert_stopped(worker: &mut Worker) {
    assert!(!worker.is_alive());
    assert!(worker.child.try_wait().unwrap().is_some());
    assert!(worker.threads.is_empty());
    assert!(worker.events.is_none());
    assert!(worker.requests.is_none());
}

#[test]
fn persistent_worker_receives_raw_audio_and_monotonic_ids() {
    let fixture = Fixture::ready(&format!("[ \"$#\" -eq 2 ]\n[ \"$1\" = --model ]\n{RESPOND}"));
    let mut worker = fixture.spawn();
    let samples: Vec<f32> = [0.25, -0.0, f32::MIN_POSITIVE, -0.75].repeat(100);
    for _ in 0..2 {
        assert_eq!(worker.transcribe(&samples, &mut || false).unwrap(), "识别 successful");
        assert!(worker.is_alive());
        let expected: Vec<u8> = samples.iter().flat_map(|sample| sample.to_le_bytes()).collect();
        assert_eq!(fs::read(fixture.record("capture")).unwrap(), expected);
        let audio_path = fs::read_to_string(fixture.record("path")).unwrap();
        assert!(!Path::new(&audio_path).exists());
    }
    assert_eq!(fs::read_to_string(fixture.record("ids")).unwrap(), "1\n2\n");
    let pid = worker.child.id();
    drop(worker);
    assert!(!process_exists(pid));
}

#[test]
fn nano_worker_receives_encoder_as_a_single_argument() {
    let mut fixture = Fixture::new(&format!(
        r#"
[ "$#" -eq 4 ]
[ "$1" = --model ]
[ "$3" = --encoder ]
[ "$4" = "${{model%/*}}/encoder weights.gguf" ]
printf '%s\n' '{{"type":"ready","protocol":1,"engine":"funasr-nano"}}'
{RESPOND}
"#
    ));
    fixture.package.kind = ModelKind::FunAsrNano;
    fixture.package.encoder = Some(fixture.package.model.with_file_name("encoder weights.gguf"));
    let mut worker = fixture.spawn();
    assert_eq!(worker.transcribe(&[0.0; 400], &mut || false).unwrap(), "识别 successful");
}

#[test]
fn gpu_worker_receives_device_index_and_cpu_default_stays_minimal() {
    let gpu = Fixture::new(&format!(
        r#"
[ "$#" -eq 4 ]
[ "$3" = --device ]
[ "$4" = 0 ]
{READY}
{RESPOND}
"#
    ));
    let mut worker = Worker::spawn(
        &gpu.executable,
        &gpu.package,
        0,
        Duration::from_secs(10),
        Duration::from_secs(10),
    )
    .unwrap();
    assert_eq!(worker.transcribe(&[0.0; 400], &mut || false).unwrap(), "识别 successful");

    let other = Fixture::new(&format!(
        r#"
[ "$#" -eq 4 ]
[ "$3" = --device ]
[ "$4" = 1 ]
{READY}
{RESPOND}
"#
    ));
    let mut worker = Worker::spawn(
        &other.executable,
        &other.package,
        1,
        Duration::from_secs(10),
        Duration::from_secs(10),
    )
    .unwrap();
    assert_eq!(worker.transcribe(&[0.0; 400], &mut || false).unwrap(), "识别 successful");

    let out_of_range = Fixture::new(RESPOND);
    let error = match Worker::spawn(
        &out_of_range.executable,
        &out_of_range.package,
        16,
        Duration::from_secs(10),
        Duration::from_secs(10),
    ) {
        Ok(_) => panic!("device index 16 should be rejected"),
        Err(error) => error,
    };
    assert!(format!("{error:#}").contains("gpu_device"), "{error:#}");
}

#[test]
fn executable_names_are_fixed_and_paths_are_absolute() {
    for (kind, name) in [
        (ModelKind::FunAsrNano, "vibe-funasr-nano-worker"),
        (ModelKind::SenseVoice, "vibe-sensevoice-worker"),
    ] {
        let executable = worker_executable(kind).unwrap();
        assert!(executable.is_absolute());
        assert_eq!(executable.file_name().unwrap(), name);
    }
}

#[test]
fn startup_rejects_invalid_handshakes_and_reaps_child() {
    for (message, expected) in [
        (
            r#"{"type":"ready","protocol":2,"engine":"sensevoice"}"#,
            "unsupported worker protocol",
        ),
        (
            r#"{"type":"ready","protocol":1,"engine":"funasr-nano"}"#,
            "worker engine mismatch",
        ),
        (r#"{"type":"result","id":1,"text":"early"}"#, "expected ready"),
        (r#"{"type":"ready","protocol":1}"#, "invalid worker protocol JSON"),
        (
            r#"{"type":"ready","protocol":1,"engine":"sensevoice","extra":true}"#,
            "invalid worker protocol JSON",
        ),
        ("not-json", "invalid worker protocol JSON"),
    ] {
        let fixture = Fixture::new(&format!("printf '%s\\n' '{message}'\nexec sleep 60"));
        let error = fixture
            .spawn_with_timeouts(Duration::from_secs(10), Duration::from_secs(10))
            .err()
            .unwrap();
        assert!(error.to_string().contains(expected), "{error:#}");
        assert!(!process_exists(fixture.pid()));
    }
}

#[test]
fn startup_eof_kills_worker_that_closed_stdout() {
    let fixture = Fixture::new("exec 1>&-\nexec sleep 60");
    let error = fixture
        .spawn_with_timeouts(Duration::from_secs(10), Duration::from_secs(10))
        .err()
        .unwrap();
    assert!(error.to_string().contains("EOF"), "{error:#}");
    assert!(!process_exists(fixture.pid()));
}

#[test]
fn startup_timeout_is_bounded_and_reaps_child() {
    let fixture = Fixture::new("exec sleep 60");
    let start = Instant::now();
    let error = fixture
        .spawn_with_timeouts(Duration::from_secs(2), INFERENCE_TIMEOUT)
        .err()
        .unwrap();
    assert!(error.to_string().contains("startup timed out"), "{error:#}");
    assert!(start.elapsed() < Duration::from_secs(8));
    // Under a fully parallel run the timeout can fire before a slow /bin/sh executes its
    // first line, so the pid file may legitimately never appear — a child killed before it
    // ran any script code is reaped by definition. Only check the pid it did record.
    if let Ok(recorded) = fs::read_to_string(fixture.record("pid")) {
        assert!(!process_exists(recorded.trim().parse().unwrap()));
    }
}

#[test]
fn transcription_rejects_protocol_errors_and_reaps_child() {
    for (body, expected) in [
        ("printf 'not-json\\n'", "invalid worker protocol JSON"),
        ("exec 1>&-", "EOF"),
        (r#"printf '{"type":"result"'; exec 1>&-"#, "unterminated line"),
        (r#"printf '%s\n' '{"type":"result","id":99,"text":"wrong"}'"#, "expected ID 1"),
        (
            r#"printf '%s\n' '{"type":"error","id":99,"message":"wrong"}'"#,
            "expected ID 1",
        ),
        (
            r#"printf '%s\n' '{"type":"error","id":1,"message":"decoder failed"}'"#,
            "decoder failed",
        ),
        (r#"printf '%s\n' '{"type":"other","id":1}'"#, "invalid worker protocol JSON"),
        (
            r#"printf '%s\n' '{"type":"result","id":1,"text":null}'"#,
            "invalid worker protocol JSON",
        ),
        (READY, "unexpected ready"),
    ] {
        let fixture = Fixture::ready(&format!("IFS= read -r request\n{body}\nexec sleep 60"));
        let mut worker = fixture.spawn();
        let error = worker.transcribe(&[0.0; 400], &mut || false).unwrap_err();
        assert!(error.to_string().contains(expected), "{error:#}");
        assert_stopped(&mut worker);
    }
}

#[test]
fn empty_result_is_valid() {
    let fixture = Fixture::ready(
        r#"IFS= read -r request
printf '%s\n' '{"type":"result","id":1,"text":""}'
exec sleep 60"#,
    );
    let mut worker = fixture.spawn();
    assert_eq!(worker.transcribe(&[0.0; 400], &mut || false).unwrap(), "");
}

#[test]
fn cancellation_kills_hung_worker_and_removes_audio_file() {
    let fixture = Fixture::ready(
        r#"IFS= read -r request
audio=${request#*\"audio_path\":\"}
audio=${audio%\"\}}
printf '%s' "$audio" > "$model.path"
exec sleep 60"#,
    );
    let mut worker = fixture.spawn();
    let mut observed_path = None;
    let start = Instant::now();
    let error = worker
        .transcribe(&[0.0; 400], &mut || match fs::read_to_string(fixture.record("path")) {
            Ok(path) if !path.is_empty() => {
                observed_path = Some(path);
                true
            }
            _ => false,
        })
        .unwrap_err();
    assert!(error.to_string().contains("cancelled"), "{error:#}");
    assert!(start.elapsed() < Duration::from_secs(3));
    assert_stopped(&mut worker);
    assert!(!Path::new(&observed_path.unwrap()).exists());
    assert!(worker
        .transcribe(&[0.0; 400], &mut || false)
        .unwrap_err()
        .to_string()
        .contains("not alive"));
}

#[test]
fn immediate_cancellation_reaps_worker() {
    let fixture = Fixture::ready("exec sleep 60");
    let mut worker = fixture.spawn();
    assert!(worker
        .transcribe(&[0.0; 400], &mut || true)
        .unwrap_err()
        .to_string()
        .contains("cancelled"));
    assert_stopped(&mut worker);
}

#[test]
fn transcription_timeout_is_bounded() {
    let fixture = Fixture::ready("exec sleep 60");
    let mut worker = fixture
        .spawn_with_timeouts(Duration::from_secs(10), Duration::from_millis(150))
        .unwrap();
    let start = Instant::now();
    let error = worker.transcribe(&[0.0; 400], &mut || false).unwrap_err();
    assert!(error.to_string().contains("transcription timed out"), "{error:#}");
    assert!(start.elapsed() < Duration::from_secs(3));
    assert_stopped(&mut worker);
}

#[test]
fn is_alive_detects_exited_child_and_joins_readers() {
    let fixture = Fixture::ready("exec sleep 60");
    let mut worker = fixture.spawn();
    worker.child.kill().unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    while worker.is_alive() {
        assert!(Instant::now() < deadline);
        thread::yield_now();
    }
    assert_stopped(&mut worker);
}

#[test]
fn drop_reclaims_flooded_stdout_and_blocked_stdin() {
    for body in [
        r#"while :; do printf '%s\n' '{"type":"result","id":1,"text":"flood"}'; done"#,
        "exec sleep 60",
    ] {
        let fixture = Fixture::ready(body);
        let worker = fixture.spawn();
        let pid = worker.child.id();
        worker
            .requests
            .as_ref()
            .unwrap()
            .try_send(vec![b'x'; 2 * MAX_STDOUT_LINE])
            .unwrap();
        let start = Instant::now();
        drop(worker);
        assert!(start.elapsed() < Duration::from_secs(3));
        assert!(!process_exists(pid));
    }
}

#[test]
fn dropping_receiver_releases_a_flooded_reader() {
    let source = Cursor::new(b"{\"type\":\"result\",\"id\":1,\"text\":\"flood\"}\n".repeat(100));
    let (tx, rx) = mpsc::sync_channel(1);
    let reader = thread::spawn(move || read_stdout(source, tx));
    assert!(matches!(rx.recv_timeout(Duration::from_secs(3)).unwrap(), Event::Message(_)));
    drop(rx);
    reader.join().unwrap();
}

#[test]
fn stderr_is_drained_without_newlines_and_retains_only_tail() {
    let fixture = Fixture::new(&format!(
        r#"
i=0
while [ "$i" -lt 2048 ]; do
    printf '0123456789abcdef' >&2
    i=$((i+1))
done
printf 'END' >&2
{READY}
IFS= read -r request
printf 'malformed\n'
exec sleep 60
"#
    ));
    let mut worker = fixture.spawn();
    let error = worker.transcribe(&[0.0; 400], &mut || false).unwrap_err();
    assert!(error.to_string().contains("worker stderr (tail):"));
    let expected = format!("{}END", "0123456789abcdef".repeat(2048));
    let tail = worker.stderr.lock().unwrap();
    assert_eq!(tail.len(), MAX_STDERR_TAIL);
    assert_eq!(tail.as_slice(), &expected.as_bytes()[expected.len() - MAX_STDERR_TAIL..]);
}

#[test]
fn stderr_tail_is_byte_bounded_even_for_invalid_utf8() {
    let bytes: Vec<u8> = (0..100_000).map(|index| (index % 256) as u8).collect();
    let tail = Arc::new(Mutex::new(Vec::new()));
    read_stderr(Cursor::new(&bytes), Arc::clone(&tail));
    assert_eq!(tail.lock().unwrap().as_slice(), &bytes[bytes.len() - MAX_STDERR_TAIL..]);
}

#[test]
fn stdout_line_limit_accepts_boundary_and_rejects_overflow() {
    let prefix = r#"{"type":"result","id":1,"text":""#;
    let suffix = "\"}";
    let text = "x".repeat(MAX_STDOUT_LINE - prefix.len() - suffix.len());
    let valid = format!("{prefix}{text}{suffix}\n");
    assert!(matches!(
        read_message(&mut Cursor::new(&valid)).unwrap(),
        Some(Message::Result { .. })
    ));
    let oversized = format!("{prefix}{text}x{suffix}\n");
    let error = read_message(&mut Cursor::new(oversized)).unwrap_err();
    assert!(error.to_string().contains("exceeds 1 MiB"));
    let unterminated = vec![b'x'; MAX_STDOUT_LINE + 1];
    assert!(read_message(&mut Cursor::new(unterminated))
        .unwrap_err()
        .to_string()
        .contains("exceeds 1 MiB"));
}

#[test]
fn stdout_rejects_partial_blank_and_non_utf8_lines() {
    for input in [&b"\n"[..], &b"\xff\n"[..], &b"{\"type\":\"ready\"}"[..]] {
        assert!(read_message(&mut Cursor::new(input)).is_err());
    }
    assert!(read_message(&mut Cursor::new([])).unwrap().is_none());
}

#[test]
fn audio_file_is_private_little_endian_and_handles_chunk_boundaries() {
    let samples: Vec<f32> = (0..MAX_SAMPLES).map(|index| (index as f32 - 200.0) / 1000.0).collect();
    let audio = write_audio(&samples, Instant::now() + Duration::from_secs(3), &mut || false).unwrap();
    let path = audio.path().to_owned();
    assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o077, 0);
    let expected: Vec<u8> = samples.iter().flat_map(|sample| sample.to_le_bytes()).collect();
    assert_eq!(fs::read(&path).unwrap(), expected);
    drop(audio);
    assert!(!path.exists());
}

#[test]
fn audio_validation_rejects_short_oversized_and_non_finite_input() {
    for (samples, expected) in [
        (vec![], "at least 400 samples"),
        (vec![0.0; 399], "at least 400 samples"),
        (vec![0.0; MAX_SAMPLES + 1], "exceeds 480000 samples"),
        (vec![f32::NAN; 400], "NaN or infinite"),
        (vec![f32::INFINITY; 400], "NaN or infinite"),
        (vec![f32::NEG_INFINITY; 400], "NaN or infinite"),
    ] {
        let error = write_audio(&samples, Instant::now() + Duration::from_secs(3), &mut || false).unwrap_err();
        assert!(error.to_string().contains(expected), "{error:#}");
    }
    let fixture = Fixture::ready("exec sleep 60");
    let mut worker = fixture.spawn();
    assert!(worker.transcribe(&[0.0; 399], &mut || false).is_err());
    assert_stopped(&mut worker);
}
