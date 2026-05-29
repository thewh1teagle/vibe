# Dead Code Review

**Date:** 2026-05-29
**Scope:** All source files in `desktop/src/` (TS/TSX) and `desktop/src-tauri/src/` (Rust), plus `desktop/src-tauri/Cargo.toml`

## Summary

| Category | Count |
|----------|-------|
| Unused imports | 0 |
| Dead functions | 1 |
| Dead exports (never imported externally) | 7 |
| Unused files | 1 |
| Unused variables | 1 |
| Unused dependencies | 2 |
| Unnecessary `pub` visibility | 3 |
| Commented-out code | 1 |
| Unreferenced struct field | 1 |
| **Total** | **17** |

## Findings

### Dead functions

- `desktop/src/lib/app.ts:33` — `openPath()` exported but never imported by any file. The Rust command `open_path` exists but this TS wrapper is unused.

### Dead exports (never imported by any other file)

- `desktop/src/lib/i18n.ts:11` — `supportedLanguageValues` exported but never imported. Only `supportedLanguages` and `supportedLanguageKeys` are used externally.
- `desktop/src/lib/i18n.ts:13` — `getI18nLanguageName()` exported but never imported. Always returns `'english'` — appears to be a leftover from multi-language support.
- `desktop/src/lib/style.ts:8` — `cx()` exported but never imported. All components import `cn()` from the same file. `cx` is a simpler filter+join but nothing uses it.
- `desktop/src/lib/sona-errors.ts:1` — `sonaErrorCodes` exported but never imported by any file.
- `desktop/src/lib/sona-errors.ts:13` — `isUserError()` exported but never imported by any file.
- `desktop/src/lib/fs.ts:5` — `pathToNamedPath()` exported but never imported. Only `ls` is imported from this module.
- `desktop/src/providers/toast.tsx:5` — `ToastModalState` interface exported but never imported. Only `ToastProvider` is imported externally (by `app.tsx`).
- `desktop/src/providers/toast.tsx:14` — `ToastContext` exported but never imported externally. Used only within `toast.tsx` itself.
- `desktop/src/providers/toast.tsx:16` — `useToastProvider()` exported but never imported externally. The file exports `ToastProvider` (used by `app.tsx`) but `useToastProvider` is never called by any consumer.

**Note:** `hotkeyRecordingActive` (`desktop/src/providers/hotkey.tsx:14`) and `DEFAULT_HOTKEY_SHORTCUT` (`desktop/src/providers/hotkey.tsx:16`) are exported but only used within `hotkey.tsx` itself. They are not imported by any other file. However, `hotkeyRecordingActive` is module-level mutable state read by the home view-model pattern — marking as "possibly unused export" since removing `export` is safe but the variable itself is used.

### Unused files

- `desktop/src/lib/sona-errors.ts` — entire file is dead. Neither `sonaErrorCodes` nor `isUserError` is imported anywhere. The file defines error code constants and a type guard that no code calls.

### Unused variables

- `desktop/src/pages/setup/view-model.ts:45` — `lastError` assigned in catch block (`lastError = err`) but only used in a template literal on line 86 (`throw new Error(... ${lastError})`). Could be inlined as `String(err)`.

### Unused dependencies (Cargo.toml)

- `desktop/src-tauri/Cargo.toml:52` — `glob = "0.3.3"` declared as direct dependency but never imported (`use glob` or `extern crate glob`) in any `.rs` file. It's already a transitive dependency of `tauri`.
- `desktop/src-tauri/Cargo.toml:50` — `tracing-log = "0.2.0"` declared as direct dependency but never imported. Already pulled in transitively by `tracing-subscriber`, and the `log` feature on `tracing` (line 49) already enables the log compatibility bridge.

### Unnecessary `pub` visibility

- `desktop/src-tauri/src/cmd/sona_cmd.rs:7` — `pub fn resolve_sona_binary` is `pub` but only called within `sona_cmd.rs` itself (lines 123, 151, 204, 233, 250). Could be `pub(crate)` or `fn`.
- `desktop/src-tauri/src/cmd/sona_cmd.rs:56` — `pub fn resolve_ffmpeg_path` is `pub` but only called within `sona_cmd.rs` itself (lines 124, 152, 205, 234). Could be `pub(crate)` or `fn`.
- `desktop/src-tauri/src/cmd/sona_cmd.rs:72` — `pub fn resolve_diarize_path` is `pub` but only called within `sona_cmd.rs` itself (lines 125, 153, 206, 235). Could be `pub(crate)` or `fn`.

### Commented-out code

- `desktop/src-tauri/src/logging.rs:37-41` — 5 lines of commented-out store preference check (`if store.get("prefs_log_to_file")...`). Dead code from a removed feature. Also, the `_store` parameter on line 28 is unused (prefixed with `_`).

### Unreferenced struct field

- `desktop/src-tauri/src/cmd/transcribe.rs:22` — `pub verbose: Option<bool>` in `TranscribeOptions` is deserialized from the frontend but never read in any Rust code. May be intentional (frontend sends it for forward-compat) but worth confirming.

### Possibly unused (not flagged as dead)

- `desktop/src/lib/model.ts:4` — `randomString()` and `desktop/src/lib/model.ts:13` — `getFilenameFromUrl()` are exported but only used internally within `downloadModel()` in the same file. The `export` keyword is unnecessary but the functions themselves are used.
- `desktop/src/lib/logs.ts:6` — `getPrettyVersion()` and `desktop/src/lib/logs.ts:17` — `getAppInfo()` are exported but only called by `collectLogs()` in the same file. Only `collectLogs` is imported externally. The `export` on these two is unnecessary.
- `desktop/src-tauri/src/cmd/mod.rs:6` — `pub mod permissions` declares an empty module (`permissions.rs` has 0 lines of code). The module exists but contains nothing. Appears to be a stub for a future feature.

### Not flagged (intentional patterns)

- `#[allow(dead_code)]` on `SonaEvent` (`sona.rs:37`) — variants are matched in `transcribe.rs`. The `allow` is for serde, not actual dead code.
- `#[allow(dead_code)]` on `ReadySignal.status` (`sona.rs:29`) — field is deserialized but never read. Intentional `allow`.
- All `#[tauri::command]` functions — used via IPC from the frontend, not dead.

## Previous Report Status

Comparing with the existing `CODE_REVIEW.md` (which documented fixes made in the `fix/code-review-top-issues` branch):

- **Previously fixed:** All 10 categories of issues documented in the old report have been addressed (dead translation keys, dead URL exports, dead model constants, keepawake plugin, etc.)
- **New findings:** All 17 findings above are newly identified and were not covered in the previous review

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
| 6 | `hotkey.tsx:14` | **Module-level mutable state** — `export let hotkeyRecordingActive` bypasses React reactivity, consumers get stale snapshot |

### LOW

| # | File | Issue |
|---|------|-------|
| 14 | `cmd/permissions.rs:2-4` | Stub always returns `true` |
| 15 | `components/ui/select.tsx`, `popover.tsx`, `scroll-area.tsx`, `card.tsx` | Use 2-space indentation instead of tabs |
| 16 | Various UI files | Hardcoded English strings bypass i18n (`"Settings"`, `"Output"`, etc.) |
