# Vibe Architecture

## Overview

Vibe is a desktop transcription app built with **Tauri** (Rust + TypeScript frontend).

## Components

### Desktop App (`desktop/`)

- **Frontend**: TypeScript + React (UI)
- **Backend**: Rust/Tauri (`desktop/src-tauri/`)
- Handles UI, file management, settings, analytics
- Spawns and communicates with the Sona runner via local HTTP

### Sona Runner (`sona/` folder)

- **Language**: Rust + whisper.cpp bindings
- **Location**: Separate repository at `github.com/thewh1teagle/sona` (also cloned locally in `./sona`)
- **Purpose**: Single local runner process for audio transcription, model loading, streaming, and diarization
- Bundled as one `sona` binary sidecar with the desktop app
- Diarization is in-process in Sona via `diarize-rs`; Vibe does not bundle or spawn a separate `sona-diarize` binary
- **Build**: Separate CI/CD in sona repository
- **Distribution**: Pre-built Sona binaries downloaded during Vibe build (see `scripts/pre_build.py`)

### FFmpeg Helper

- macOS and Windows builds also bundle `ffmpeg` from the Sona release archives
- Vibe passes its path to Sona with `SONA_FFMPEG_PATH`

### Build Flow

1. Vibe CI runs `scripts/pre_build.py`
2. Script downloads pre-built Sona binaries from Sona releases
3. Binaries placed in `desktop/src-tauri/binaries/`
4. Tauri bundles `sona` and, where configured, `ffmpeg` into the final app

## Key Point for Agents

Native runtime compatibility issues for transcription usually come from the Sona runner or its linked whisper/ggml libraries, not the Vibe UI code.

To fix Sona runtime compatibility issues, update **Sona's** build configuration in the Sona repository, then bump `.sona-version` in Vibe.
