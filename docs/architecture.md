# Vibe Architecture

## Overview

Vibe is a desktop transcription app built with **Tauri** (Rust + TypeScript frontend).

## Components

### Desktop App (`desktop/`)

- **Frontend**: TypeScript + React (UI)
- **Backend**: Rust/Tauri (`desktop/src-tauri/`)
- Handles UI, file management, settings, analytics
- Spawns and communicates with sona sidecar via HTTP

### Sona Sidecar (`sona/` folder)

- **Language**: Go + whisper.cpp (CGo bindings)
- **Location**: Separate repository at `github.com/thewh1teagle/sona` (also cloned locally in `./sona`)
- **Purpose**: HTTP server for audio transcription and model loading
- Bundled as binary sidecar with the desktop app
- **Build**: Separate CI/CD in sona repository
- **Distribution**: Pre-built binaries downloaded during Vibe build (see `scripts/pre_build.py`)

### Build Flow

1. Vibe CI runs `scripts/pre_build.py`
2. Script downloads pre-built sona binaries from sona releases
3. Binaries placed in `desktop/src-tauri/binaries/`
4. Tauri bundles sona as sidecar into final app

## Key Point for Agents

**GLIBCXX/library compatibility issues come from the sona binary**, not the Vibe Rust code.

To fix Linux compatibility issues, update **sona's** build configuration in the sona repository, not Vibe's `release.yml`.
