# Sona as a Managed Service Architecture

## Context

Sona wraps whisper.cpp via CGo and exposes transcription over an OpenAI-compatible HTTP API. Today it works as a standalone CLI/server. The goal is to make it a **general-purpose transcription backend** that any application — desktop GUIs, Python scripts, Rust services, Node apps — can spawn as a child process, manage its lifecycle, and communicate with over HTTP.

The primary use case driving this: a desktop transcription app currently has its own tightly-coupled whisper integration (Rust/FFI). That app wants to replace its internal transcription engine with Sona as a sidecar binary. This means Sona must be trivially embeddable: spawn it, know when it's ready, load/switch models at runtime, stream transcription results, and shut it down cleanly. If Sona handles this well, it becomes the single place where whisper.cpp compilation, GPU linking, and model management happens — and every consumer just speaks HTTP.

Key requirements from a parent app's perspective:
- **No model baked into startup** — the parent decides which model to load and when
- **Know when Sona is ready** — without polling, the parent reads stdout for a ready signal
- **Dynamic port allocation** — multiple apps can each spawn their own Sona without port conflicts
- **Graceful shutdown** — SIGTERM finishes the current job, frees GPU memory, exits cleanly
- **Progress feedback** — long transcriptions (1h+ audio) need streaming segments, not a blocked request

## What Sona needs to be a proper managed service

### 1. Lifecycle signals

Right now `sona serve model.bin` loads the model at startup and that's it. A parent process needs:

- **`GET /health`** — "are you alive" (immediate, no model needed)
- **`GET /ready`** — "is a model loaded and ready to transcribe"
- **Graceful shutdown** — handle SIGTERM, finish current transcription, free model, exit cleanly
- **Stdout signal on ready** — print something like `{"status":"ready","port":11531}` to stdout so the parent process knows when to start sending requests, instead of polling

### 2. Model management via API, not CLI args

Currently the model is a CLI arg. That means to switch models you kill the process and restart it. Instead:

```
POST /v1/models/load    {"path": "/models/ggml-large.bin"}
DELETE /v1/models        (unload, free VRAM)
GET /v1/models           (already exists — what's loaded)
```

Load allocates the whisper context. Unload frees it. The process stays running. This is the single biggest architectural change — Sona starts "empty" and loads models on demand.

### 3. Port negotiation

Hardcoded port 11531 breaks when two apps both want Sona. Two options:

- **`--port 0`** — OS assigns a free port, Sona prints it to stdout on startup
- **Unix socket** — `sona serve --socket /tmp/sona.sock` — no port conflicts at all, and better security (macOS/Linux only, but Windows has named pipes)

The stdout-on-ready pattern handles both:
```json
{"status":"ready","port":52341}
```
or
```json
{"status":"ready","socket":"/tmp/sona-a1b2c3.sock"}
```

### 4. Process identity

If multiple apps spawn Sona independently, they might want to share one instance or run isolated ones. A simple approach:

- Each Sona instance writes a pidfile: `/tmp/sona-<port>.pid`
- A parent can check if an existing instance is alive before spawning a new one
- Or just let each app own its own Sona — simpler, no coordination needed

### 5. Progress on long transcriptions

A 2-hour audio file takes minutes. The current API blocks until done. Add:

- **Response streaming** — chunked transfer encoding, emit segments as JSON lines as they complete
- Or **async mode** — `POST /v1/audio/transcriptions` returns a job ID, `GET /v1/jobs/{id}` returns status/progress/partial results

Streaming is simpler and more useful. JSON lines is trivial to parse in any language.

## Target architecture sketch

```
sona serve [--port PORT | --socket PATH]
  ├── starts HTTP server (no model loaded yet)
  ├── prints {"status":"ready", ...} to stdout
  │
  ├── GET  /health              → 200 always
  ├── GET  /ready               → 200 if model loaded, 503 if not
  │
  ├── POST   /v1/models/load    → load model, alloc context
  ├── DELETE /v1/models          → free context, release VRAM
  ├── GET    /v1/models          → what's loaded (exists already)
  │
  ├── POST /v1/audio/transcriptions  → transcribe (streams segments)
  │
  └── SIGTERM → finish current job → free model → exit 0
```

## Parent app integration pattern

Any parent application's integration becomes:

```
1. spawn `sona serve --port 0`
2. read stdout until you get the ready JSON
3. POST /v1/models/load with desired model
4. POST /v1/audio/transcriptions as needed
5. on quit: send SIGTERM, wait for exit
```

That's ~30 lines in any language. No SDK, no bindings, no shared memory.

## What stays the same

The internals — `internal/whisper/`, `internal/audio/`, the CGo layer — don't change. This is all in `internal/server/` and `cmd/sona/`. The clean architecture already in place is why this is straightforward. We're adding lifecycle management around an already-solid core.

## Implementation priority

1. Health/ready endpoints + graceful shutdown (foundation)
2. Model load/unload via API (biggest change)
3. Port 0 + stdout ready signal (parent process integration)
4. Streaming transcription responses (quality of life)
5. Pidfile / process identity (optional, for shared instances)
