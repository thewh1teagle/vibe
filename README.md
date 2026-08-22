# Sona 🎧

Sona is a local transcription runner built on top of whisper.cpp.

It runs as a standalone process and exposes an OpenAI-compatible HTTP API, so other apps (desktop apps, Python scripts, etc.) can spawn it and talk to it easily.

Think of it as a small, fast, local Whisper server you control.

This runner is used by the [thewh1teagle/vibe](https://github.com/thewh1teagle/vibe) project.

---

## Why Sona ✨

- Fully local transcription
- Cross-platform single binary
- GPU-accelerated by default
- OpenAI-compatible API
- Designed to be spawned and owned by another process
- No heavy setup, no long-running system service

---

## Platform & GPU Support 🚀

Sona ships prebuilt binaries for:

- macOS (x86_64 and arm64)
- Linux (x86_64 and arm64)
- Windows (x86_64)

GPU acceleration is enabled by default:

- macOS: CoreML / Metal
- Linux: Vulkan
- Windows: Vulkan

Sona automatically uses the best available backend for the platform.

---

## How It Works 🧠

1. Your app starts the Sona process
2. Sona binds to a local port (optionally chosen by the OS)
3. Your app talks to Sona over HTTP
4. Models are loaded and unloaded at runtime
5. Transcription requests go through an OpenAI-compatible endpoint

Sona is intentionally simple and predictable, so it can be embedded into larger systems.

---

## Quick Start ⚡

### 1. Download a release binary

https://github.com/vibe-transcribe/sona/releases

### 2. Download a model

```console
./sona pull https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

### 3. Start Sona

```console
./sona serve --port 0
```

Using port 0 lets the OS assign a free port automatically.

When ready, Sona prints a single machine-readable line to stdout:

```json
{"status":"ready","port":52341}
```

This is intended for parent processes to detect readiness and discover the bound port.

---

## Using Sona 🔌

Sona exposes an OpenAI-compatible transcription API.

This means:
- You can use existing OpenAI SDKs
- You don’t need custom client code
- Switching between local (Sona) and remote (OpenAI) is trivial

See the full API reference here:
- API docs: /docs
- OpenAPI spec: /openapi.json

---

## Notes & Limitations ⚠️

- One transcription runs at a time per process  
  concurrent requests return 429
- Non-WAV audio is automatically converted using ffmpeg
  - system ffmpeg or a bundled binary next to sona

---

## When to Use Sona 🎯

Sona is a good fit if you want:
- Local or offline transcription
- Low-latency transcription in desktop apps
- Full control over models and hardware
- An OpenAI-like API without the OpenAI dependency

---

## Documentation 📚

- API reference: /docs
- OpenAPI schema: /openapi.json
- Releases: https://github.com/vibe-transcribe/sona/releases
