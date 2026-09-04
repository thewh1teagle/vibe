# vibe-server 🎧

vibe-server is a local transcription runner built on top of ggml.cpp.

It runs as a standalone process and exposes an OpenAI-compatible HTTP API, so other apps (desktop apps, Python scripts, etc.) can spawn it and talk to it easily.

Think of it as a small, fast, local Whisper server you control.

It is the engine of [Vibe](https://github.com/thewh1teagle/vibe) and lives in this repository under `server/`; it also runs on its own.

---

## Why vibe-server ✨

- Fully local transcription
- Cross-platform single binary
- GPU-accelerated by default
- OpenAI-compatible API
- Designed to be spawned and owned by another process
- No heavy setup, no long-running system service

---

## Platform & GPU Support 🚀

vibe-server ships prebuilt binaries for:

- macOS (x86_64 and arm64)
- Linux (x86_64 and arm64)
- Windows (x86_64)

GPU acceleration is enabled by default:

- macOS: CoreML / Metal
- Linux: Vulkan
- Windows: Vulkan

vibe-server automatically uses the best available backend for the platform.

---

## How It Works 🧠

1. Your app starts the vibe-server process
2. vibe-server binds to a local port (optionally chosen by the OS)
3. Your app talks to vibe-server over HTTP
4. Models are loaded and unloaded at runtime
5. Transcription requests go through an OpenAI-compatible endpoint

vibe-server is intentionally simple and predictable, so it can be embedded into larger systems.

---

## Quick Start ⚡

### 1. Download a release binary

https://github.com/thewh1teagle/vibe/releases?q=server-v

### 2. Download a model

```console
./vibe-server pull https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

### 3. Start vibe-server

```console
./vibe-server serve --port 0
```

Using port 0 lets the OS assign a free port automatically.

When ready, vibe-server prints a single machine-readable line to stdout:

```json
{"status":"ready","port":52341}
```

This is intended for parent processes to detect readiness and discover the bound port.

---

## Using vibe-server 🔌

vibe-server exposes an OpenAI-compatible transcription API.

This means:
- You can use existing OpenAI SDKs
- You don’t need custom client code
- Switching between local (vibe-server) and remote (OpenAI) is trivial

See the full API reference here:
- API docs: /docs
- OpenAPI spec: /openapi.json

---

## Notes & Limitations

- One transcription runs at a time per process  
  concurrent requests return 429
- Non-WAV audio is automatically converted using ffmpeg
  - system ffmpeg or a bundled binary next to vibe-server

---

## When to Use vibe-server 🎯

vibe-server is a good fit if you want:
- Local or offline transcription
- Low-latency transcription in desktop apps
- Full control over models and hardware
- An OpenAI-like API without the OpenAI dependency

---

## Documentation 📚

- API reference: /docs
- OpenAPI schema: /openapi.json
- Releases: https://github.com/thewh1teagle/vibe/releases?q=server-v
