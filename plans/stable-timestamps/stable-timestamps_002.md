# Plan: stable-timestamps flag for Sona

## Goal

Add `stable_timestamps=true` to `POST /v1/audio/transcriptions` so Sona produces
more reliable timestamps by enabling whisper.cpp VAD-backed decoding through the
existing transcription path.

## Background

Sona already routes both streaming and non-streaming transcription through
`internal/whisper.Context.TranscribeStream(...)`, and the bundled whisper headers
already expose VAD support (`params.vad`, `params.vad_model_path`,
`whisper_vad_default_params`). That means this feature can fit the current
architecture as an additional transcription option instead of a separate
execution mode.

For the VAD model itself, current upstream `whisper.cpp` uses a separate GGML
artifact from:

- `https://huggingface.co/ggml-org/whisper-vad`

Expected file format:

- `ggml-silero-v6.2.0.bin` (or another `ggml-silero-*.bin` variant)

This is a GGML model file, not ONNX.

## Changes

### 1. `sona/internal/whisper/whisper.go`

Extend `TranscribeOptions` with:

```go
StableTimestamps bool   // enable whisper.cpp VAD-assisted timestamping
VadModelPath     string // path to the VAD model file
```

### 2. `sona/internal/whisper/whisper_cgo.go`

Wire the new options into the existing `TranscribeStream` setup:

```go
if opts.StableTimestamps && opts.VadModelPath != "" {
    params.vad = C.bool(true)
    params.vad_model_path = C.CString(opts.VadModelPath)
    params.vad_params = C.whisper_vad_default_params()
}
```

Implementation notes:

- free the C string with `C.free(...)`
- only enable VAD when both the flag is on and a non-empty model path is present
- keep the existing callback path unchanged so streaming still emits `progress`,
  `segment`, and final `result`
- reuse the same result collection logic after `whisper_full(...)`

### 3. `sona/internal/server/api_handlers.go`

Parse and validate new multipart form fields alongside the existing transcription
options:

```go
StableTimestamps: parseBoolFormValue(r.FormValue("stable_timestamps")),
VadModelPath:     r.FormValue("vad_model"),
```

Validation:

- if `stable_timestamps=true` and `vad_model` is empty, return `400`

## API surface

| Field | Type | Description |
|---|---|---|
| `stable_timestamps` | bool | Enable whisper.cpp VAD-based timestamp stabilization |
| `vad_model` | string | Path to the VAD model file on disk |

## Error cases

- `stable_timestamps=true` + missing `vad_model` -> `400 bad request`
- invalid or unreadable VAD model path -> `500 internal error`
- normal transcription failures still surface through the existing error path

## Notes

- This plan follows Sona’s current single-process, one-transcription-at-a-time
  architecture documented in `docs/architecture.md` and
  `sona/docs/architecture.md`
- The feature stays inside the current `TranscribeStream` flow, so no new server
  mode, queue, or alternate runner is needed
