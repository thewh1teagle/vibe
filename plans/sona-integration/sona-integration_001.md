# Plan: Replace vibe_core with sona sidecar

## Context

Vibe is a Tauri v2 desktop app (Rust + React) for offline audio transcription. It currently uses `vibe_core` — a Rust library wrapping whisper.cpp via `whisper-rs` with in-process FFI. This migration replaces vibe_core entirely with **sona**, a prebuilt Go binary that runs as a local HTTP server with an OpenAI-compatible API. This eliminates the complex whisper-rs/CGO build, removes speaker diarization (pyannote-rs), and simplifies the architecture to: Tauri app spawns sona process, talks HTTP.

**User decisions:**
- Unsupported TranscribeOptions (temperature, n_threads, etc.) → keep UI, Rust layer silently ignores
- CLI mode → delegate to `sona transcribe` subprocess
- Server mode → remove entirely

---

## Step 1: Create `sona.rs` — sidecar process manager + HTTP client

**New file:** `/desktop/src-tauri/src/sona.rs`

```rust
pub struct SonaProcess {
    port: u16,
    child: std::process::Child,
    client: reqwest::Client,
}
```

Methods:
- `spawn(binary_path) -> Result<SonaProcess>` — runs `sona serve --port 0`, reads `{"status":"ready","port":N}` from stdout
- `load_model(path) -> Result<()>` — POST `/v1/models/load`
- `transcribe_stream(file, language, translate, prompt, enhance_audio) -> impl Stream<Item=SonaEvent>` — POST `/v1/audio/transcriptions` with `stream=true`, parses ndjson lines
- `kill()` — kills child process

Event enum for ndjson parsing:
```rust
#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum SonaEvent {
    Progress { progress: i32 },
    Segment { start: f64, end: f64, text: String },
    Result { text: String },
}
```

Dependencies to add to Cargo.toml: `reqwest` (multipart + stream), `futures-util` (StreamExt for ndjson line parsing).

---

## Step 2: Create local types + utilities

**New file:** `/desktop/src-tauri/src/types.rs`

Move `Segment` and `Transcript` structs here (copied from `core/src/transcript.rs`). Remove `speaker` field. Keep centisecond timestamps (convert from sona's float seconds in the Rust layer: `(seconds * 100.0) as i64`). Copy the `as_srt()`, `as_vtt()`, `as_text()`, `as_json()` formatting methods.

Copy `get_vibe_temp_folder()` (7 lines from `core/src/lib.rs`).

Copy `find_ffmpeg_path()` (~20 lines from `core/src/audio.rs`) and the `merge_wav_files()` / `normalize()` ffmpeg wrappers (~15 lines each) into a local `audio_utils.rs` or inline in `cmd/audio.rs`.

---

## Step 3: Rewrite `setup.rs` — replace ModelContext with SonaState

**File:** `/desktop/src-tauri/src/setup.rs`

Replace:
```rust
pub struct ModelContext {
    pub path: String,
    pub gpu_device: Option<i32>,
    pub use_gpu: Option<bool>,
    pub handle: WhisperContext,
}
```
With:
```rust
pub struct SonaState {
    pub process: Option<SonaProcess>,
    pub loaded_model_path: Option<String>,
}
```

Change `app.manage(Mutex::new(None::<ModelContext>))` → `app.manage(Mutex::new(SonaState { process: None, loaded_model_path: None }))`.

Remove `use vibe_core::transcribe::WhisperContext`.

---

## Step 4: Rewrite `cmd/mod.rs` — core transcription commands

**File:** `/desktop/src-tauri/src/cmd/mod.rs`

### 4a. `load_model()`
- Acquire `SonaState` mutex
- If sona not running, spawn it (resolve binary via Tauri sidecar path)
- Call `sona.load_model(&model_path)` via HTTP
- Remove `gpu_device` and `use_gpu` params (sona auto-selects GPU)

### 4b. `transcribe()`
- Build multipart form: `file`, `language`, `stream=true`, `prompt`, `translate`, `enhance_audio`
- Silently ignore unsupported TranscribeOptions fields (temperature, n_threads, word_timestamps, max_sentence_len, sampling_strategy, max_text_ctx)
- Stream ndjson response:
  - `progress` → emit `transcribe_progress` event
  - `segment` → convert float seconds to centiseconds, emit `new_segment` event
  - `result` → done
- Abort: listen for `abort_transcribe` event, drop the reqwest stream (sona detects disconnect)
- Remove `DiarizeOptions`, `FfmpegOptions` params
- Remove `catch_unwind` (sona crashes are isolated)

### 4c. `download_model()` / `download_file()`
- Inline the reqwest download logic from `core/src/downloader.rs` (~40 lines). No whisper dependency.

### 4d. Remove/stub GPU commands
- `get_cargo_features()` → return empty vec
- `get_cuda_version()` → return empty string
- `get_rocm_version()` → return empty string
- `is_avx2_enabled()` → return true
- `check_vulkan()` → remove or return Ok

### 4e. `get_ffmpeg_path()` → use local `find_ffmpeg_path()`

---

## Step 5: Fix `cmd/audio.rs`, `cmd/ytdlp.rs`, `cleaner.rs`

Replace `vibe_core::get_vibe_temp_folder()` → local `get_vibe_temp_folder()`.
Replace `vibe_core::audio::merge_wav_files()` → local ffmpeg wrapper.
Replace `vibe_core::audio::normalize()` → local ffmpeg wrapper.

---

## Step 6: Rewrite `cli.rs` — delegate to sona CLI

**File:** `/desktop/src-tauri/src/cli.rs`

Replace the `vibe_core::transcribe::create_context()` + `transcribe()` calls with spawning `sona transcribe <model> <audio> --language <lang>` as a subprocess. Pipe stdout to console. For format selection (srt/vtt/txt), parse sona's output or request the appropriate format.

Remove all `use vibe_core::*` imports.

---

## Step 7: Remove server mode

- Delete `/desktop/src-tauri/src/server.rs`
- Remove `#[cfg(feature = "server")] mod server;` from `main.rs`
- Remove `server` feature and `axum`/`utoipa`/`utoipa-swagger-ui` deps from Cargo.toml

---

## Step 8: Update `main.rs`

- Add `mod sona;` and `mod types;`
- Remove `#[cfg(feature = "server")] mod server;`
- Remove GPU-related commands from `invoke_handler`
- Add shutdown hook via `.on_event()` to kill sona process on app exit

---

## Step 9: Update Cargo.toml files

### `/desktop/src-tauri/Cargo.toml`
- Remove all `vibe_core` dependency blocks (3 platform-specific)
- Remove all feature flags (`cuda`, `coreml`, `metal`, `openblas`, `rocm`, `vulkan`, `server`)
- Remove `axum`, `utoipa`, `utoipa-swagger-ui`, `ash`, `libc`, `libc-stdhandle`
- Add `reqwest = { version = "0.12", features = ["multipart", "stream"] }`
- Add `futures-util = "0.3"`

### `/Cargo.toml` (workspace)
- Change members from `["core", "desktop/src-tauri"]` to `["desktop/src-tauri"]`

---

## Step 10: Configure sona as Tauri sidecar

### `/desktop/src-tauri/tauri.conf.json`
Add:
```json
"bundle": {
    "externalBin": ["binaries/sona"]
}
```

Place sona binaries at:
- `desktop/src-tauri/binaries/sona-aarch64-apple-darwin`
- `desktop/src-tauri/binaries/sona-x86_64-apple-darwin`
- `desktop/src-tauri/binaries/sona-x86_64-pc-windows-msvc.exe`
- `desktop/src-tauri/binaries/sona-x86_64-unknown-linux-gnu`
- `desktop/src-tauri/binaries/sona-aarch64-unknown-linux-gnu`

### `/desktop/src-tauri/capabilities/main.json`
Add shell execute permission for sona sidecar.

---

## Step 11: Simplify `build.rs`

Remove `extract_whisper_env()`, `CUDA_VERSION`, `ROCM_VERSION` env extraction. Keep `commit_hash()`, `copy_locales()`, `WINDOWS_PORTABLE`, `tauri_build::build()`.

---

## Step 12: Frontend changes

### `viewModel.ts` (home + batch)
- Remove `diarizeOptions` from `invoke('transcribe', ...)` calls
- Remove `gpuDevice`, `useGpu` from `invoke('load_model', ...)` calls

### `Params.tsx`
- Remove entire "Speaker Recognition" section (toggle, threshold, max speakers, model download)

### `Preference.tsx`
- Remove: `recognizeSpeakers`, `maxSpeakers`, `diarizeThreshold`, `gpuDevice`, `useGpu`, `highGraphicsPreference` and their setters/defaults

### `transcript.ts`
- Remove `speaker` field from Segment interface
- Remove `mergeSpeakerSegments()` and speaker formatting logic

### `TextArea.tsx`
- Remove speaker label rendering

---

## Step 13: Delete `core/` directory

Remove the entire `/core` directory from the repo.

---

## Step 14: Update CI/CD

Add step to download sona prebuilt binaries per target triple and place in `desktop/src-tauri/binaries/`. Remove whisper-rs build setup, Vulkan SDK setup, feature flag matrix.

---

## Verification

1. `cargo build` in `desktop/src-tauri/` compiles without vibe_core
2. App launches, spawns sona process (check `ps aux | grep sona`)
3. Load a whisper model → sona logs show model loaded
4. Transcribe an audio file → progress events appear in UI, segments stream in
5. Abort mid-transcription → sona stops, UI resets
6. CLI mode: `vibe --transcribe model.bin audio.wav` → delegates to sona, prints output
7. Audio recording (if testing on macOS) → merge/normalize still work via ffmpeg
8. Model download → progress bar works, file saved correctly

---

## Implementation Status

- [x] Step 1: `sona.rs` sidecar manager and HTTP client
- [x] Step 2: Local `types.rs` and `audio_utils.rs`
- [x] Step 3: `setup.rs` migrated to `SonaState`
- [x] Step 4: `cmd/mod.rs` rewritten for sidecar flow
- [x] Step 5: `cmd/audio.rs`, `cmd/ytdlp.rs`, `cleaner.rs` moved off `vibe_core`
- [x] Step 6: `cli.rs` delegated to `sona` CLI
- [x] Step 7: Server mode removed
- [x] Step 8: `main.rs` updated (sidecar modules + shutdown handling + GPU invoke cleanup)
- [x] Step 9: Cargo manifests updated (`core` removed from workspace)
- [x] Step 10: Tauri sidecar config/capability added
- [x] Step 11: `build.rs` simplified
- [x] Step 12: Frontend speaker/GPU cleanup completed
- [x] Step 13: `core/` directory removed
- [x] Step 14: CI/CD updated for Sona sidecar download in release workflow; obsolete `test_core` workflow removed
