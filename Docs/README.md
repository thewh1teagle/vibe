# Vibe Simplify — Global Dictation

Forked from [thewh1teagle/vibe](https://github.com/thewh1teagle/vibe) and stripped down to **global dictation only**.

Press a hotkey from anywhere in Windows, speak, and your speech is transcribed and output directly to your clipboard or typed at the cursor.

## Features

- Global hotkey dictation (default: `Ctrl+Shift+V`)
- **Fix text** hotkey (default: `Ctrl+Space`) — select text anywhere, press hotkey, LLM fixes or rewrites it, result copied to clipboard. Four modes: Fix, Rewrite, Formal, Casual
- **Local transcription** via Whisper (offline, no data leaves your device)
- **Groq cloud transcription** (fast, online, requires API key)
- Optional **AI cleanup** of Groq transcripts (fixes spelling, punctuation, filler words; translates to the selected output language)
- Output to clipboard or type at cursor
- Model selection — choose between local Whisper models or Groq cloud
- Raw text mode for clipboard output (no line breaks between segments) — type-at-cursor always strips line breaks
- **Output language** selector (auto / English / Danish) — when set to English or Danish, AI cleanup will also translate into that language
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
Dictation:  Hotkey press → record from default mic → release → Whisper transcribes → clipboard or type
Fix text:   Select text → Ctrl+Space → simulates Ctrl+C → LLM fixes text → clipboard
```

The app uses [sona](https://github.com/thewh1teagle/sona) — a Go + whisper.cpp HTTP server — as a sidecar binary for transcription. Fix text uses Groq's `llama-3.3-70b-versatile` model.

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

**AI cleanup** (optional): when enabled, the raw transcript is post-processed by Groq's `llama-3.3-70b-versatile` chat model. The LLM fixes common STT artefacts — spelling (`Gethub` → `GitHub`), punctuation, filler words (`øh`, `altså`, `hm` for Danish; `um`, `uh`, `like` for English), and capitalization — and, when a non-Auto **Output language** is selected, translates the dictated text into that language. If the cleanup call fails, the raw transcript is used as a fallback. Adds ~200ms of latency. Disabled by default; enable in the home screen under "AI cleanup (Groq only)".

## Fix Text

Select text in any application, press `Ctrl+Space`, and the LLM will fix or rewrite it. The result is copied to your clipboard — paste it with `Ctrl+V`.

Requires a Groq API key (same as cloud transcription). Enable/disable and change the hotkey in the home screen.

### Modes

| Mode | What it does |
|------|-------------|
| **Fix** | Corrects errors + minor clarity improvements (conservative) |
| **Rewrite** | Restructures for clarity and engagement (aggressive) |
| **Formal** | Makes the tone professional |
| **Casual** | Makes the tone relaxed |

## Credits

Built on [Tauri](https://tauri.app/), [whisper.cpp](https://github.com/ggerganov/whisper.cpp), and the original [Vibe](https://github.com/thewh1teagle/vibe) project.
