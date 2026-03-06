# Plan: stable-timestamps flag for Sona

## Goal

Add `stable_timestamps=true` form param to `POST /v1/audio/transcriptions`.
When enabled, Sona runs per-segment VAD decoding instead of full-audio decode,
producing accurate word timestamps that beat stable-ts (target: <2% word overlap vs
stable-ts's 5.7%).

## Background

whisper.cpp decodes full 30s windows and hallucinates words in silence gaps.
The fix: use VAD to find speech segments, decode each one independently, then
shift timestamps by the segment's start offset. This is the "user_vad" approach
proven to achieve 1.27% word overlap using only public whisper.cpp APIs.

## What's needed

A **separate silero-vad ONNX model file** (`silero_vad.onnx` or similar).
whisper.cpp VAD is not built into the whisper model — it requires its own file.
Users must provide it. Sona accepts it as a per-request form field `vad_model`.

## Changes

### 1. `internal/whisper/whisper.go`

Add to `TranscribeOptions`:
```go
StableTimestamps bool   // run per-segment VAD decode for accurate timestamps
VadModelPath     string // path to silero-vad ONNX model (required if StableTimestamps)
```

### 2. `internal/whisper/whisper_cgo.go`

Add `TranscribeStable(samples []float32, opts TranscribeOptions, cb StreamCallbacks)` method
(or branch inside `TranscribeStream`):

```
1. whisper_vad_init_from_file_with_params(opts.VadModelPath, default_params)
2. whisper_vad_segments_from_samples(vctx, vad_params, samples, n_samples)
3. for each VAD segment i:
     a. slice samples[start:end]
     b. whisper_full(c.ctx, params, slice, len)   // params.vad = false
     c. read segments, shift Start/End by offset_cs = t0[i]
     d. append to result
4. whisper_vad_free_segments / whisper_vad_free
5. return combined TranscribeResult
```

Streaming: fire `cb.OnSegment` per shifted segment in the loop (natural fit).

### 3. `internal/server/api_handlers.go`

```go
opts := whisper.TranscribeOptions{
    ...existing fields...
    StableTimestamps: parseBoolFormValue(r.FormValue("stable_timestamps")),
    VadModelPath:     r.FormValue("vad_model"),
}
```

Validate: if `stable_timestamps=true` and `vad_model` is empty, return 400.

## API surface (new fields)

| Field | Type | Description |
|---|---|---|
| `stable_timestamps` | bool | Enable per-segment VAD decode |
| `vad_model` | string | Path to silero-vad model on disk |

## Error cases

- `stable_timestamps=true` + no `vad_model` → 400 bad request
- VAD model file not found / failed to load → 500
- VAD returns 0 segments (silence-only audio) → return empty result

## Performance

- One `whisper_full` call per VAD segment (e.g. 46 calls for a 5-min file)
- ~3-4x slower than standard decode (same as naive per-segment approach)
- Quality priority over speed; chunking optimization is future work

## Out of scope

- Bundling the VAD model with Sona
- Chunked/batched VAD segments (future optimization)
- Snapping (whisper_stable_snap_segments) — not available without the PR patch
