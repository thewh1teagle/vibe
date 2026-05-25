# Vibe — Global Dictation

Forked from [thewh1teagle/vibe](https://github.com/thewh1teagle/vibe) and simplified to **global dictation only**.

Press a hotkey from anywhere in Windows, speak, and your speech is transcribed via Whisper and output directly to your clipboard or typed at the cursor.

## Features

- Global hotkey dictation (default: `Ctrl+Shift+V`)
- Offline transcription via Whisper (no data leaves your device)
- Output to clipboard or type at cursor
- Auto-detects or manually selects language (auto / English / Danish)
- GPU acceleration support
- Dark theme (always on)
- Inline dictation controls (toggle, shortcut, output mode)
- Compact language picker (auto / English / Danish)

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
pnpm exec tauri dev
```

## Build

```bash
cd desktop
pnpm exec tauri build
```

## How It Works

```
Hotkey press → record from default mic → release → Whisper transcribes → clipboard or type
```

The app uses [sona](https://github.com/thewh1teagle/sona) — a Go + whisper.cpp HTTP server — as a sidecar binary for transcription.

## Credits

Built on [Tauri](https://tauri.app/), [whisper.cpp](https://github.com/ggerganov/whisper.cpp), and the original [Vibe](https://github.com/thewh1teagle/vibe) project.
