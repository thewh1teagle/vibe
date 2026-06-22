# Vibe Simplify — Global Dictation

Forked from [thewh1teagle/vibe](https://github.com/thewh1teagle/vibe) and stripped down to **global dictation only**.

Press a hotkey from anywhere in Windows, speak, and your speech is transcribed and output directly to your clipboard or typed at the cursor.

## Features

- Global hotkey dictation (default: `Ctrl+Shift+V`)
- **Local transcription** via Whisper (offline, no data leaves your device)
- **Groq cloud transcription** (fast, online, requires API key)
- Output to clipboard or type at cursor
- Model selection — choose between local Whisper models or Groq cloud
- Raw text mode for clipboard output (no line breaks between segments) — type-at-cursor always strips line breaks
- Auto-detects or manually selects language (auto / English / Danish)
- GPU acceleration support
- Dark theme
- System tray — minimizes to tray, runs in the background
- Model preloaded on app start for instant first dictation

## Prerequisites

- [pnpm](https://pnpm.io/)
- [uv](https://docs.astral.sh/uv/)
- [Rust](https://www.rust-lang.org/tools/install)

## Quick Start

```bash
# Download sona sidecar (required once)
uv run scripts/pre_build.py --target x86_64-pc-windows-msvc

# Install and run
cd desktop
pnpm install
pnpm tauri dev
```

Or from the root folder:

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Tray Usage

The app starts minimized to the system tray. Left-click the tray icon to open the window, right-click for "Show" or "Quit". Closing the window hides it back to the tray — the app keeps running with the global hotkey active.

## How It Works

```
App start → preload model in background → ready
Hotkey press → record from default mic → release → Whisper transcribes → clipboard or type
```

The app uses [sona](https://github.com/thewh1teagle/sona) — a Go + whisper.cpp HTTP server — as a sidecar binary for transcription.

## Transcription Options

### Local (Whisper)

On first run, the app downloads a Whisper GGML model from HuggingFace:

- Primary: `ggml-large-v3-turbo.bin` (~1.5 GB) — fast and accurate
- Fallback: `ggml-medium.bin` — smaller, slightly less accurate
- Source: [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp)

The model is stored in `%LOCALAPPDATA%\github.com.thewh1teagle.vibe\` and loaded by the sona sidecar. You can also download custom GGML models by pasting a URL in Settings.

> **Tip:** If the download is very slow, turn off your VPN. HuggingFace sometimes throttles VPN traffic.

### Groq Cloud

Fast cloud transcription via [Groq](https://groq.com/). Requires a free API key — enter it in Settings or during setup. Transcription runs on Groq's servers with very low latency.

## Credits

Built on [Tauri](https://tauri.app/), [whisper.cpp](https://github.com/ggerganov/whisper.cpp), and the original [Vibe](https://github.com/thewh1teagle/vibe) project.
