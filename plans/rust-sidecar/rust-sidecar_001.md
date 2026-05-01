# Rust sidecar validation

Runs a self-contained validation of the Rust sidecar:

```bash
uv run plans/rust-sidecar/rust-sidecar_001.py
```

Checks:

- downloads a GGML whisper model into `.models/`
- builds `vibe-server`
- starts `vibe-server serve --port 0`
- loads the model over `POST /v1/models/load`
- transcribes `samples/short.wav` over `POST /v1/audio/transcriptions`
- verifies `stream=true` returns `application/x-ndjson` events, including a final result event
- verifies Sona-compatible `stable_timestamps=true` validation when `vad_model` is missing
- verifies non-WAV ffmpeg conversion with `samples/short.mp4` when ffmpeg is installed
- verifies in-process diarization returns speaker labels when `.models/diar_streaming_sortformer_4spk-v2.1.onnx` is present
