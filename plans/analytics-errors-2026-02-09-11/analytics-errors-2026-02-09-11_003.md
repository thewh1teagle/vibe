# Fixes Applied (2026-02-12)

## Done

| Priority | Issue | Fix |
|---|---|---|
| P0 | Non-ASCII model paths (83 events) | sona: `os.ReadFile` + `whisper_init_from_buffer_with_params` bypasses broken `fopen` |
| P0 | Transcribe without model (99 events) | vibe: disabled buttons + "Select a model in Settings" hint |
| P1 | Sona Vulkan crash (71 events) | sona: delay-load `vulkan-1.dll` + runtime check + CPU fallback |
| P1 | Sona dies mid-session (171 events) | vibe: detect dead process, capture stderr, surface in error/analytics |

Also: version+commit in sona ready signal, download models link reordered in settings.

## Remaining

| Priority | Issue | Events |
|---|---|---|
| P2 | Ubuntu GLIBCXX compat | 11 |
| P2 | macOS Accelerate symbol (<14) | 7 |
| P3 | OOM on large files | 17 |
| P3 | ffmpeg not found (Windows) | 9 |
| P4 | Server busy / double-click | 26 |
