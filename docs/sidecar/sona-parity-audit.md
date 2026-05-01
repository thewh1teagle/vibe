# Sona parity audit

This audit compares `crates/vibe-server` with the vendored Go Sona server in `sona/internal/server`.

## Matches Sona

- Sidecar process prints one ready JSON line with `status`, `port`, `version`, and `commit`.
- `GET /health`.
- `GET /ready`, including `503` and `"message":"no model loaded"` when no model is loaded.
- `POST /v1/models/load` with `path`, `gpu_device`, and `no_gpu`.
- `DELETE /v1/models`.
- `GET /v1/models`.
- `POST /v1/audio/transcriptions`.
- Rejects concurrent transcriptions with `429 busy`.
- Rejects missing model with `503 no_model` before streaming starts.
- Supports `json`, `verbose_json`, `text`, `srt`, and `vtt` response formats.
- Supports live `application/x-ndjson` streaming for progress, segment, error, and result events.
- Aborts streaming inference when the client disconnects.
- Supports in-process Sortformer diarization with `diarize_model`, adding `speaker` to `verbose_json` segments and streaming segment events.
- Supports ffmpeg fallback for non-native audio and `enhance_audio`.
- Raises the upload limit to Sona's 15 GB limit.
- Supports `language`, `detect_language`, `translate`, `prompt`, `n_threads`, `temperature`, `max_text_ctx`, `word_timestamps`, `max_segment_len`, `sampling_strategy`, `best_of`, and `beam_size`.
- Supports Sona-style `stable_timestamps=true` validation and forwards `vad_model` to whisper.cpp.
- Supports `devices` with ggml backend GPU enumeration.

## Remaining Gaps

- No known runtime feature gaps against Sona's current local server contract.

## Validation

Run:

```bash
uv run plans/rust-sidecar/rust-sidecar_001.py
```

This validates model load, normal transcription, live NDJSON streaming, missing-VAD validation for stable timestamps, and ffmpeg conversion for `samples/short.mp4` when ffmpeg is installed.
