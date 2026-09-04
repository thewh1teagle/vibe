# vibe-server Architecture 🧩

This document describes how vibe-server is structured internally and how the runtime behaves.

vibe-server is intentionally simple: one process, one model, one transcription at a time.

---

## Overview

vibe-server is a single-process Rust binary with two operating modes:

- `vibe-server transcribe <model.bin> <audio>`  
  One-shot local transcription, no server.

- `vibe-server serve [model.bin] --port <n>`  
  Long-running HTTP runner with an OpenAI-compatible API.

The server follows a **runner model**, not a shared service model:
- one owner process spawns vibe-server
- the owner manages lifecycle
- communication happens over local HTTP

This keeps ownership, shutdown, and scaling explicit and predictable.

---

## Runtime Components 🧱

High-level layout of the codebase:

- `crates/vibe-server/src/cli.rs`  
  CLI entrypoints:
  - `transcribe`
  - `serve`
  - `pull`

- `crates/vibe-server/src/audio.rs`  
  Audio decoding and normalization:
  - Converts input to `16kHz` mono `float32`
  - Fallback to `ffmpeg` for all other formats

- `crates/whisper-rs`  
  Rust/bindgen wrapper over `whisper.cpp`:
  - Segment callbacks
  - Progress callbacks
  - Abort callbacks for cancellation
  - Stable timestamp/VAD support

- `crates/diarize-rs`  
  In-process Sortformer diarization.

- `crates/vibe-server/src/server`  
  HTTP layer:
  - routing
  - model lifecycle
  - concurrency control
  - graceful shutdown

---

## Server Lifecycle 🔄

1. `server::serve` binds a TCP port  
   - `--port 0` is supported for auto-assigned ports

2. Once bound, vibe-server prints exactly one machine-readable line to stdout:

```json
{"status":"ready","port":52341}
```

3. HTTP server begins handling requests

4. On `SIGINT` / `SIGTERM`:
   - stop accepting new connections
   - unload model by dropping the whisper context
   - exit cleanly

This design makes vibe-server easy to supervise from another process.

---

## API Surface 🌐

Lifecycle endpoints:

- `GET /health`  
  Always returns `200` when the process is alive.

- `GET /ready`  
  - `200` when a model is loaded  
  - `503` when no model is loaded

Model management:

- `POST /v1/models/load`  
  Loads a model from disk, replacing any existing model.

- `DELETE /v1/models`  
  Unloads the current model (idempotent).

- `GET /v1/models`  
  Returns an OpenAI-style model list with 0 or 1 entries.

Transcription:

- `POST /v1/audio/transcriptions`  
  Multipart upload with options:
  - `response_format`: `json`, `text`, `verbose_json`, `srt`, `vtt`
  - `stream`: `true|false`
  - `language`
  - `detect_language`
  - `prompt`
  - `enhance_audio`

Documentation endpoints:
- `/docs`
- `/openapi.json`

---

## Transcription Execution Flow 🧠

1. The transcription service attempts to acquire a global mutex using `try_lock`
2. If already busy, request fails with `429` (no queue)
3. If no model is loaded, request fails with `503`
4. Multipart `file` is read (max size: `1 GB`)
5. Audio is decoded via `audio::read_bytes_with_options`
6. Transcription runs via `Context::transcribe_stream(...)`
   - non-stream requests still use the stream-capable path
   - client disconnect triggers the abort callback
7. Output is formatted based on `response_format`:
   - `json`: `{ "text": "..." }`
   - `verbose_json`: text + timestamped segments
   - `text`, `srt`, `vtt`: plain text responses

---

## Streaming Mode 📡

When `stream=true`, the response is:

- `Content-Type: application/x-ndjson`

Events are emitted as newline-delimited JSON objects:

- `progress`  
  - `progress: 0–100`

- `segment`  
  - `start`
  - `end`
  - `text`

- `result`  
  - final `text`

- `error`  
  - `message` if inference fails before disconnect

Closing the client connection cancels inference immediately via the whisper abort callback.

---

## Concurrency Model 🔒

- A single mutex protects:
  - model state
  - inference execution

Effective behavior:
- only one model loaded at a time
- only one transcription running at a time
- concurrent transcription requests return `429`

Scaling is explicit and process-level:
- run multiple vibe-server instances if needed

---

## Build & Packaging 🛠️

- Whisper commit pinned via `.whispercpp-commit`
- Platform-specific static libs downloaded to `libs/lib` (ignored)
- Headers fetched to `libs/include` (checked in)
- Rust binary links against platform whisper / ggml libs
- Release packaging bundles:
  - `vibe-server`
  - `ffmpeg` binary (when applicable)

---

## Current Boundaries 🚧

vibe-server intentionally does **not** include:

- authentication or multi-tenant logic
- internal job queues or async job IDs
- daemon or service-manager integration
- in-process bindings for non-Rust runtimes

Integrations are expected to happen over HTTP.

This keeps vibe-server small, predictable, and easy to embed.
