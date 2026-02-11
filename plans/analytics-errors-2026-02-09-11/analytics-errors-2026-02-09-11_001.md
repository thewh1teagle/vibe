# Analytics Error Report (2026-02-09 to 2026-02-11)

11,613 events, 15 OS variants. 80.5% Windows, 15.8% macOS, 3.7% Linux.

## sona_spawn_failed (89 events)

- **Windows** (71) — `EOF while parsing sona ready signal`, sona crashes silently on startup. Mostly Win10 22H2 (10.0.19045). No stderr captured.
- **Ubuntu 22.04** (11) — `GLIBCXX_3.4.32 not found`. Built against newer libstdc++ than what Ubuntu 22.04 ships.
- **macOS 12-13** (7) — `Symbol not found: _cblas_sgemm$NEWLAPACK$ILP64`. Accelerate framework symbol missing on older macOS.

Almost all on v3.0.9 (73) and v3.0.8 (15), only 1 on 3.0.10.

## transcribe_failed (681 events, 14.2% failure rate)

| Category | Count | Notes |
|---|---|---|
| model_load_failed | 159 | Mostly Windows — non-ASCII paths (e.g. `C:\Users\José\AppData\...`) break model loading |
| other (whisper codes, binary not found) | 128 | Whisper error codes -4/-7 on Linux; ffmpeg missing on Windows |
| sona_connection_failed | 124 | Sona died between spawn and use (Win 106, macOS 16) |
| no_model_selected | 99 | Users hit transcribe without downloading a model |
| sona_spawn_eof | 86 | Same root cause as sona_spawn_failed |
| sona_transcribe_error | 59 | "server busy" (26), "no model loaded" (18), invalid audio/ffmpeg (15) |
| server_busy | 26 | Users double-clicking transcribe |

Failure rate by OS: Ubuntu 40.7%, Linux Mint 21.4%, Windows 14.8%, Arch 14.7%, CachyOS 13.3%, macOS 9.8%.

## Top actionable fixes

1. **Non-ASCII Windows paths** — model loading fails for accented usernames. Short-path fallback or make sona handle UTF-8 paths properly.
2. **Ubuntu GLIBCXX** — ship sona built against older glibc or bundle libstdc++.
3. **macOS Accelerate** — `_cblas_sgemm$NEWLAPACK$ILP64` missing on macOS <14. Lower deployment target or dynamically resolve.
4. **"No model selected" UX** — 99 events. Disable transcribe button or auto-prompt model download.
5. **Out of memory** — 17 events on Windows reading audio. Streaming or file size validation.
6. **ffmpeg not found** — 9 events on Windows. Bundle ffmpeg or show clear error.
