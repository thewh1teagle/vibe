# Managed Service — Gaps & Distribution

Follow-up to `managed-service_001.md`. Covers gaps found when evaluating the architecture against real use cases (desktop GUI app replacing in-process FFI, Python library, general FFI replacement).

## Gaps in 001 plan

### 1. Cancellation

A desktop app has an abort button — user clicks cancel mid-transcription. The current plan has no way to cancel a running job. Over HTTP this must be explicit:

- `DELETE /v1/audio/transcriptions/{job_id}` — cancel a running transcription
- Or simpler: the streaming connection itself is the handle — client closes the connection, server aborts processing

The second approach (connection-based cancellation) is simpler and aligns with the streaming design. If the client disconnects, Sona should detect this and stop the whisper inference via the existing abort callback in the CGo layer.

### 2. Timestamps and output formats

Sona currently returns `{"text": "..."}`. A GUI app needs segments with start/end times to show timed results and export subtitles. The OpenAI transcription API supports a `response_format` parameter:

- `json` — `{"text": "full text"}` (current behavior)
- `text` — plain text string
- `verbose_json` — `{"segments": [{"start": 0.0, "end": 2.5, "text": "Hello"}], "language": "en", "duration": 30.0}`
- `srt` — SubRip subtitle format
- `vtt` — WebVTT subtitle format

`verbose_json` is the critical one. Without it, Sona can't replace an in-process engine for any app that displays timed transcription. This is not optional — it's required for the desktop app use case and useful for every other consumer.

The data is already available in whisper.cpp's output (`whisper_full_get_segment_t0`, `whisper_full_get_segment_t1`). Sona's CGo layer just doesn't expose it yet.

### 3. Diarization (out of scope, but noted)

The desktop app has speaker identification via pyannote (ONNX models for segmentation + embedding). Sona doesn't have this. Acceptable to leave out for now — it's a separate concern that can be layered on later. But any app replacing an in-process engine with Sona loses diarization unless Sona adds it eventually.

### 4. Model switching cost

Loading a whisper model takes 1-5 seconds depending on size and whether GPU is involved. The 001 plan's load/unload API is correct, but apps need to know:

- Loading is not instant — the API should be async or clearly blocking
- Consider: support keeping multiple models loaded simultaneously (memory permitting), with a `model` parameter on the transcription request selecting which one to use
- Or accept single-model-at-a-time and let the app manage the reload cost

Single model is simpler and fine for most cases. Multiple models is a future optimization if needed.

## Distribution

The "any language can use Sona via HTTP" story breaks down if installing Sona itself is hard. Distribution is as important as the architecture.

### Python: `pip install sona`

Ship prebuilt platform binaries inside Python wheels. This is how `ruff`, `oxlint`, `turbo` etc. distribute Go/Rust binaries through pip. Platform-specific wheels (`sona-0.1.0-py3-none-macosx_arm64.whl`, etc.), each containing the single `sona` binary.

The Python package is a thin wrapper:

```python
import sona

process = sona.serve()  # spawns binary, waits for ready, returns handle
# use OpenAI client as before
process.stop()
```

No manual download, no PATH management. pip handles platform detection. Go's cross-compilation makes this easy — CI already builds for 6 platform targets. Adding wheel packaging is a straightforward addition to the release pipeline.

### Desktop apps: bundled sidecar

Ship the `sona` binary alongside the app, same as ffmpeg is bundled today. The app spawns it on launch, manages the process. No user-facing installation step.

### System-wide: package managers

`brew install sona` / `apt` / `choco` / `scoop` — for users who want Sona running as a persistent service or accessible from multiple projects. Lower priority than pip and sidecar bundling.

### Auto-download on first run

Like Playwright downloads browsers. A thin package (pip/npm/cargo) that fetches the right binary from GitHub releases on first use. Lighter distribution packages, but adds network dependency and cache management. Fallback option if wheel sizes become a concern.

## Updated implementation priority

From 001, with additions:

1. **`response_format` support** — especially `verbose_json` with timestamps (required for desktop app use case)
2. Health/ready endpoints + graceful shutdown (foundation)
3. Model load/unload via API (biggest architectural change)
4. Port 0 + stdout ready signal (parent process integration)
5. Connection-based cancellation (abort on client disconnect)
6. Streaming transcription responses with segments (quality of life)
7. Python wheel distribution (pip install sona)
8. Pidfile / process identity (optional)
