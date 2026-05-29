# Dead Code Review

**Date:** 2026-05-29
**Branch:** `chore/remove-dead-code`
**Scope:** All source files in `desktop/src/` (TS/TSX) and `desktop/src-tauri/src/` (Rust), plus `desktop/src-tauri/Cargo.toml`

## Summary

| Category | Count | Removed |
|----------|-------|---------|
| Dead functions | 1 | 1 |
| Dead exports | 12 | 12 |
| Dead variables | 1 | 1 |
| Unused files | 2 | 2 |
| Unused dependencies | 2 | 2 |
| Commented-out code | 2 | 2 |
| Unnecessary `pub` visibility | 3 | 3 |
| Possibly unused exports | 4 | 4 |
| Unreferenced struct field | 1 | 1 |
| **Total** | **28** | **28** |

## Removed (this branch)

### Dead functions
- `desktop/src/lib/app.ts:33` — `openPath()` removed. Also removed unused `invoke` and `NamedPath` imports.

### Dead exports
- `desktop/src/lib/i18n.ts:11` — `supportedLanguageValues` removed.
- `desktop/src/lib/i18n.ts:13` — `getI18nLanguageName()` removed.
- `desktop/src/lib/style.ts:8` — `cx()` removed.
- `desktop/src/lib/fs.ts:5` — `pathToNamedPath()` removed.
- `desktop/src/providers/toast.tsx:5` — `ToastModalState` interface made private.
- `desktop/src/providers/toast.tsx:14` — `ToastContext` made private.
- `desktop/src/providers/toast.tsx:16` — `useToastProvider()` removed (dead, never called).
- `desktop/src/providers/hotkey.tsx:14` — `hotkeyRecordingActive` removed (only written, never read).
- `desktop/src/providers/hotkey.tsx:16` — `DEFAULT_HOTKEY_SHORTCUT` made private.
- `desktop/src/lib/model.ts:4` — `randomString()` made private.
- `desktop/src/lib/model.ts:13` — `getFilenameFromUrl()` made private.
- `desktop/src/lib/logs.ts:6` — `getPrettyVersion()` made private.
- `desktop/src/lib/logs.ts:17` — `getAppInfo()` made private.

### Dead variables
- `desktop/src/pages/setup/view-model.ts:45` — `lastError` inlined.

### Unused files
- `desktop/src/lib/sona-errors.ts` — deleted (entire file unused).
- `desktop/src-tauri/src/cmd/permissions.rs` — deleted (empty module). Removed `pub mod permissions` from `cmd/mod.rs`.

### Unused dependencies
- `desktop/src-tauri/Cargo.toml:52` — `glob = "0.3.3"` removed.
- `desktop/src-tauri/Cargo.toml:50` — `tracing-log = "0.2.0"` removed.

### Commented-out code
- `desktop/src-tauri/src/logging.rs:37-41` — removed commented-out store preference check.
- `desktop/src-tauri/src/logging.rs:57` — removed commented-out `set_global_default` line.
- `desktop/src-tauri/src/logging.rs:28` — removed unused `_store` parameter and its imports (`Arc`, `Wry`, `Store`).
- `desktop/src-tauri/src/setup.rs:35` — updated `setup_logging` call to match new signature. Removed unused `store` variable and `StoreExt` import.

### Unnecessary `pub` visibility
- `desktop/src-tauri/src/cmd/sona_cmd.rs:7` — `pub fn resolve_sona_binary` → `pub(crate) fn`.
- `desktop/src-tauri/src/cmd/sona_cmd.rs:56` — `pub fn resolve_ffmpeg_path` → `pub(crate) fn`.
- `desktop/src-tauri/src/cmd/sona_cmd.rs:72` — `pub fn resolve_diarize_path` → `pub(crate) fn`.

### Unreferenced struct field
- `desktop/src-tauri/src/cmd/transcribe.rs:22` — `verbose` removed from `TranscribeOptions`. Also removed from `ModelOptions` interface and default options in `preference.tsx`.

## Still open

Nothing — all dead code findings resolved.

## Previous Report Status

Comparing with the previous `CODE_REVIEW.md` (which documented fixes made in the `fix/code-review-top-issues` branch):

- **Previously fixed:** All 10 categories of issues documented in the old report have been addressed (dead translation keys, dead URL exports, dead model constants, keepawake plugin, etc.)
- **This branch:** All 28 dead code findings resolved.

---

## Remaining Issues (from previous review, still open)

### CRITICAL

| # | File | Issue |
|---|------|-------|
| 1 | `cmd/audio.rs:62-64` | **Unsafe `Send + Sync` on `StreamHandle`** — no safety justification, potential data race if cpal changes internals |
| 2 | `tauri.conf.json:20` | **CSP disabled (`null`)** — no defense against XSS. Attempted fix broke i18n; needs careful CSP that allows Tauri IPC protocols (`ipc:`, `asset:`, `tauri.localhost`) |
| 3 | `tauri.conf.json:12-14` | **Asset protocol scope `"**"`** — frontend can read any file on disk. Needs scoping to `$RESOURCE/**` + app directories without breaking i18n |

### HIGH

| # | File | Issue |
|---|------|-------|
| 4 | `setup.rs:9` | **Global `STATIC_APP` with `std::sync::Mutex`** — if crash occurs while another thread holds mutex, it's poisoned and crash dialog won't show |
| 5 | `tauri.conf.json:8` | **`withGlobalTauri: true`** — exposes entire Tauri IPC API on `window.__TAURI__` to any script. Requires CSP to be safe |

### LOW

| # | File | Issue |
|---|------|-------|
| 14 | `components/ui/select.tsx`, `popover.tsx`, `scroll-area.tsx`, `card.tsx` | Use 2-space indentation instead of tabs |
| 15 | Various UI files | Hardcoded English strings bypass i18n (`"Settings"`, `"Output"`, etc.) |
