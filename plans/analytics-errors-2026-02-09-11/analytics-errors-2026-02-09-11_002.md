# Error Triage — What's Actually Happening

## 1. sona_spawn_failed on Windows (71 events, 18 users)

18 users hitting it repeatedly (one guy hit it 13 times). Sona crashes silently on startup — no stderr, just EOF when vibe tries to read the ready signal JSON from stdout.

Root cause is almost certainly **missing Vulkan runtime**. Sona on Windows links against `vulkan-1.dll` (`-lvulkan-1` in `whisper_windows.go`). If the user doesn't have Vulkan drivers installed (older GPUs, VMs, some Intel iGPUs), sona just dies on launch. The process exits before printing the `{"status":"ready","port":...}` JSON, vibe reads empty stdout → EOF parse error.

**Fix**: Sona should detect Vulkan availability at startup and fall back to CPU-only mode, or at minimum print a human-readable error to stderr before crashing. On the vibe side, the error message shown to users is garbage — `"EOF while parsing a value at line 1 column 0"` means nothing to anyone. Should catch this pattern and show "Sona failed to start. This might be caused by missing GPU drivers."

## 2. sona_spawn_failed on Ubuntu 22.04 (11 events, all same user probably)

Clear as day: `GLIBCXX_3.4.32 not found`. Sona was compiled against a newer libstdc++ than Ubuntu 22.04 ships. Ubuntu 22.04 has GLIBCXX up to 3.4.30.

**Fix**: Build sona on Ubuntu 22.04 (or equivalent older glibc) so the binary is compatible with older distros. Or statically link libstdc++.

## 3. sona_spawn_failed on macOS 12-13 (7 events)

`Symbol not found: _cblas_sgemm$NEWLAPACK$ILP64` — Accelerate framework symbol added in macOS 14. Sona links against `-framework Accelerate` (in `whisper_darwin.go`) and uses a symbol only available on newer macOS.

**Fix**: Set `MACOSX_DEPLOYMENT_TARGET` to 12.0 when building, or use a compatibility shim. The whisper.cpp ggml-blas backend needs to use the older BLAS API.

## 4. model_load_failed (159 events, 56 users) — THE BIG ONE

Single biggest error bucket. Breakdown:
- **83 events (52%) have non-ASCII paths** — users with e.g. accented or non-Latin usernames (`C:\Users\José\...`, `C:\Users\שלום\...`). Model lives at `C:\Users\{username}\AppData\Local\...\ggml-model.bin` so any non-ASCII username = broken.
- **76 events with ASCII paths** — likely corrupted downloads, out of disk space, or incompatible model files.

The path flows: Rust `to_str()` → HTTP multipart → Go `C.CString()` → whisper.cpp `fopen()`. On Windows, `fopen()` with a UTF-8 string doesn't work for non-ASCII paths — you need `_wfopen()` with wide chars. The whisper.cpp C library is probably using plain `fopen` internally.

**Fix options**:
- Short-term: Copy model to a temp path with ASCII-only name before loading
- Long-term: Ensure whisper.cpp uses `_wfopen` on Windows (or use a variant with wide path support)

## 5. sona_connection_failed (171 events, 50 users)

Sona spawns successfully but then dies before/during model loading. **Zero overlap with spawn_failed users** — completely separate population. Retry logic does 3 attempts with exponential backoff (500ms → 1s → 2s), all fail with connection refused.

Likely sona crashing during model load (OOM, GPU init failure) and the process dying. Vibe doesn't check if sona is still alive before retrying — just hammers the same dead port.

**Fix**: Before retrying, check if the child process is still running (`try_wait()` on the child). If sona died, capture stderr and show the actual crash reason instead of "failed to send load_model request after 3 attempts".

## 6. no_model_selected (99 events) — Pure UX bug

Transcribe button is **completely unguarded**. No `disabled` state, no check. Users click transcribe → starts the flow → only THEN checks if `modelPath` is set → throws error → shows error modal → user closes → clicks again → repeat.

Model selection is buried in Settings, not on the home page. Default `modelPath` is `null`.

**Fix**: Disable the transcribe button when `!modelPath`. Show inline text like "Select a model in Settings to get started". Same fix needed for batch page and hotkey transcription.

## 7. server_busy (26 events)

Users double-clicking transcribe while one is in progress. Sona returns HTTP 429 "server is busy with another transcription". The `TryLock()` mutex prevents concurrent transcriptions.

**Fix**: Might need debouncing or disabling the button more aggressively during transcription.

## 8. ffmpeg not found (9 events, Windows only)

`unsupported audio format and ffmpeg not found: exec: 'ffmpeg': executable file not found in %PATH%`. Users trying to transcribe non-WAV files without ffmpeg bundled.

**Fix**: Should be bundled. If it's already supposed to be bundled, the resolution path (`{exe_dir}/ffmpeg.exe`) might be wrong for some install configurations (portable mode, custom install dir).

## 9. Out of memory (17 events, 2 users)

`failed to read audio file: out of memory` — sona reads the entire audio file into memory. Two users on Windows hitting this repeatedly with presumably huge files.

**Fix**: Stream the audio or validate file size before attempting to read. Show a clear error like "File too large" instead of "out of memory".

## 10. HTML response in model load (8 events, 1 user)

Sona returns a full HTML `<!DOCTYPE html>` page instead of JSON. Single user behind a **corporate proxy/firewall** intercepting localhost HTTP traffic. Edge case, not fixable on our end.

---

## Priority ranking by impact

| Priority | Issue | Events | Users | Effort |
|---|---|---|---|---|
| **P0** | Non-ASCII model paths (Windows) | 83 | ~30 | Medium — temp copy or wfopen |
| **P0** | Disable transcribe without model | 99 | unknown | Tiny — UI guard |
| **P1** | Sona spawn silent crash (Windows/Vulkan) | 71 | 18 | Medium — detect + fallback |
| **P1** | Sona dies mid-session, no detection | 171 | 50 | Small — check process alive on retry |
| **P2** | Ubuntu GLIBCXX compat | 11 | ~1 | Build infra — older base image |
| **P2** | macOS Accelerate symbol | 7 | ~3 | Build flag — deployment target |
| **P3** | OOM on large files | 17 | 2 | Small — file size check |
| **P3** | ffmpeg not found | 9 | ~5 | Small — verify bundling |
| **P4** | Server busy / double-click | 26 | ? | Tiny — UI debounce |

Top 4 fixes (P0 + P1) would eliminate ~424 of 681 transcribe_failed events (~62%) and all 89 spawn failures. Roughly **cutting total errors by two thirds**.
