# Arquitetura (RW Vibe)

## Overview

RW Vibe é um aplicativo desktop de transcrição construído com **Tauri** (Rust + frontend TypeScript).

## Components

### Desktop App (`desktop/`)

- **Frontend**: TypeScript + React (UI)
- **Backend**: Rust/Tauri (`desktop/src-tauri/`)
- Handles UI, file management, settings, analytics
- Spawns and communicates with sona sidecar via HTTP
 - Inicia e se comunica com o sidecar `sona` via HTTP

### Sona Sidecar (`sona/` folder)

- **Language**: Go + whisper.cpp (CGo bindings)
- **Language**: Go + whisper.cpp (CGo bindings)
- **Purpose**: HTTP server for audio transcription and model loading
- Bundled as binary sidecar with the desktop app
- **Build**: Separate CI/CD in sona repository
- **Distribuição**: binários pré-compilados baixados durante o build (veja `scripts/pre_build.py`)

### Build Flow

1. CI executa `scripts/pre_build.py`
2. Script downloads pre-built sona binaries from sona releases
3. Binaries placed in `desktop/src-tauri/binaries/`
4. Tauri bundles sona as sidecar into final app

## Key Point for Agents

**Problemas de compatibilidade (GLIBCXX/bibliotecas) geralmente vêm do binário do `sona`**, não do código Rust do app.

Para corrigir compatibilidade no Linux, ajuste o build do `sona` (não o `release.yml` do app).
