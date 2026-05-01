# Rust transcription sidecar

Vibe now has a Rust sidecar workspace under `crates/`:

- `crates/whisper-rs-sys`: builds whisper.cpp from source and links the static whisper/ggml archives.
- `crates/whisper-rs`: safe Rust wrapper around the whisper.cpp C API.
- `crates/vibe-server`: local HTTP sidecar compatible with the Sona runner shape.

The sys crate enables Metal on macOS and Vulkan on Linux/Windows by default. Set `WHISPER_CPP_DIR` to use a local whisper.cpp checkout, or `WHISPER_CPP_TAG` to build another upstream tag.

## Build

```bash
cargo build -p vibe-server --release
```

The binary is:

```bash
target/release/vibe-server
```

## Run as sidecar

```bash
target/release/vibe-server serve --port 0
```

The first stdout line is machine-readable and matches the current parent-process contract:

```json
{"status":"ready","port":12345,"version":"0.1.0","commit":"dev"}
```

## HTTP API

- `GET /health`
- `GET /ready`
- `GET /docs`
- `GET /openapi.json`
- `GET /v1/models`
- `POST /v1/models/load`
- `DELETE /v1/models`
- `POST /v1/audio/transcriptions`
- `GET /v1/devices`

Model load body:

```json
{"path":"/path/to/ggml-model.bin","gpu_device":0,"no_gpu":false}
```

Transcription uses OpenAI-style multipart form input:

```bash
curl -F file=@samples/short.wav \
  -F response_format=verbose_json \
  http://127.0.0.1:12345/v1/audio/transcriptions
```

Supported `response_format` values are `json`, `verbose_json`, `text`, `srt`, and `vtt`. Streaming uses newline-delimited JSON when `stream=true`.

## Validate with sample audio

```bash
uv run plans/rust-sidecar/rust-sidecar_001.py
```

The script downloads `ggml-tiny.en.bin` into `.models/`, builds `vibe-server`, starts it on an ephemeral port, loads the model, and transcribes `samples/short.wav`.
