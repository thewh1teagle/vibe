# Code Review — Vibe Desktop

## Changes Made (fix/code-review-top-issues)

### 1. Security — HTTP & Filesystem scope hardening

**`capabilities/main.json`**
- Restricted fs scope from `"**"` (full disk) to specific directories: `$RESOURCE/**`, `$APPCONFIG/**`, `$APPDATA/**`, `$APPLOCALDATA/**`, `$CONFIG/**`, `$DATA/**`, `$HOME/Documents/**`
- Restricted HTTP scope from `*://**:*/**` (any host) to `huggingface.co/**`, `github.com/**`, `raw.githubusercontent.com/**` only

**`boundary-fallback.tsx`**
- Replaced unsafe `(window as any).__TAURI__` hack with proper `getCurrentWindow()` import from `@tauri-apps/api/window`

> **Note:** CSP and asset protocol were reverted to original (`csp: null`, `"**"` scope) as they broke i18n locale loading. Needs a separate focused effort to enable CSP without blocking Tauri IPC.

### 2. Panic prevention — `unwrap()`/`expect()` replaced with proper error handling

| File | Line | Change |
|------|------|--------|
| `cmd/audio.rs:124` | `expect("lock")`/`expect("writer")` | Replaced with `match` + `continue` on failure |
| `sona.rs:184` | `Client::builder().build().unwrap()` | Replaced with `.context("...")?` |
| `setup.rs:35` | `setup_logging(...).unwrap()` | Replaced with `match` + `eprintln!` fallback |
| `build.rs:5-9` | `Command::new("git").output().unwrap()` | Graceful fallback to `"unknown"` |
| `build.rs:18` | `dst.parent().unwrap()` | `if let Some(parent)` guard |
| `build.rs:24-29` | robocopy exit codes 0-7 treated as failures | Proper exit code check (`>= 8` = error) |
| `build.rs:36` | Fragile 3-level `OUT_DIR` parent traversal | Dynamic walk-up to find `debug`/`release` dir |
| `files.rs:89` | `to_str().unwrap()` on path | Changed to `to_string_lossy()` |

### 3. Event listener leaks — properly cleaned up

| File | Change |
|------|--------|
| `setup/view-model.ts` | Store `listen()` unlisten ref, clean up in `useEffect` return. Fixed typo `handleProgressEvenets` → `handleProgressEvents` |
| `cmd/download.rs` | Store `listener_id`, call `app_handle.unlisten()` after download completes (both `download_model` and `download_file`) |
| `cmd/transcribe.rs` | Store `listener_id`, call `app_handle.unlisten()` after transcription completes |

### 4. Orphaned sona process on exit

**`main.rs`**
- Replaced `try_lock()` (which silently fails if lock is held) with `block_in_place` + `blocking_lock` with 2-second timeout
- Prints error to stderr if lock can't be acquired

### 5. React correctness

| File | Change |
|------|--------|
| `app.tsx:21` | Moved `document.body.dir = dir` from render body into `useEffect(() => { ... }, [dir])` |
| `use-single-instance.tsx:46` | Fixed `if (newFiles)` (always truthy on `[]`) → `if (newFiles.length > 0)` |
| `use-single-instance.tsx` | Moved listener into `useEffect` with proper cleanup return |

### 6. Dead code, CI & config fixes

**Dead code removed:**

| File | What |
|------|------|
| `Cargo.toml` | Removed `tauri-plugin-keepawake` optional dependency and feature flag |
| `main.rs` | Removed `#[cfg(feature = "keepawake")]` plugin init block |
| `pre_build.py` | Removed `download_diarize()` call and `DIARIZE_ASSET_MAP` (sona-diarize binaries no longer bundled) |
| `common.json` | Removed **161 dead translation keys** (kept only 48 used keys + 3 missing keys added) |
| `lib/config.ts` | Removed 6 dead URL exports (`aboutURL`, `updateVersionURL`, `discordURL`, `unsupportedCpuReadmeURL`, `supportVibeURL`, `latestReleaseURL`, `latestVersionWithoutVulkan`) and 8 dead model constants (`embeddingModel*`, `segmentModel*`, `diarizeModel*`, `vadModel*`) |
| `extensions.json` | Removed Svelte extension recommendation (landing website was deleted) |
| `launch.json` | Removed `vibe_core` debug config (package doesn't exist), removed stale `FFMPEG_DIR`/`OPENBLAS_PATH`/`LIBCLANG_PATH` env vars from release config |

**CI fixes (`lint_rust.yml`):**

| Fix | Before | After |
|-----|--------|-------|
| Trigger path | `'.github/workflows/lint.yml'` (wrong name) | `'.github/workflows/lint_rust.yml'` |
| Phantom path | `'cli/src/**'` (deleted directory) | Removed |
| Runner | `macos-latest` | `windows-latest` |
| Lockfile | `pnpm install` | `pnpm install --frozen-lockfile` |

**Config fixes:**

| File | Fix |
|------|-----|
| `components.json` | `"rtl": true` → `"rtl": false` |
| `components.json` | `"utils": "~/lib/utils"` → `"utils": "~/lib/style"` (file actually exists) |
| `package.json` | `"@tauri-apps/cli": "~2.10.0"` → `"~2.11.0"` (match API version) |
| `eslint.config.js` | Removed `eslint-plugin-react` import (not installed), removed duplicate `sourceType` config, removed orphaned react rules |
| `Cargo.toml` | Version `"0.0.6"` → `"3.0.19"` (synced with `tauri.conf.json`) |

### 7. Accessibility & code quality

**Accessibility:**

| File | Change |
|------|--------|
| `error-modal.tsx` | Copy icon: `onMouseDown` → `onClick`, added `tabIndex={0}`, `role="button"`, `aria-label` |
| `error-modal.tsx` | Report button: `onMouseDown` → `onClick` |
| `settings/page.tsx` | 3 buttons: `onMouseDown` → `onClick` |
| `info-tooltip.tsx` | Tooltip `<span>`: added `tabIndex={0}`, `role="button"`, `aria-label="More info"` |
| `spinner.tsx` | Added `role="status"`, `aria-label="Loading"` |
| `setup/page.tsx` | Offline dialog: added proper `<DialogTitle>` and `<DialogHeader>` |

**Code quality:**

| File | Change |
|------|--------|
| `ffmpeg.rs:32` | Removed duplicate `use chrono::Local` import |
| `files.rs:31` | `eprintln!` → `tracing::error!` |
| `logs.ts:55-56` | Fixed comments: "debug" → "error", "3 lines" → "10 lines" |
| `preference.tsx` | Removed wasted `isFirstRun` localStorage read/write |

### 8. Low-hanging cleanup

| File | Change |
|------|--------|
| `Cargo.toml` | Removed unused `bytemuck` dependency |
| `ffmpeg.rs:48` | Removed redundant `is_file() && exists()` → `is_file()` |
| `ffmpeg.rs:102` | Increased stderr read limit from 1000 → 4096 bytes |
| `app.ts:27` | `getIssueUrl`: `async` → sync (no await inside) |
| `error-modal.tsx` | Removed unnecessary `await` on `getIssueUrl` |
| `package.json` | Moved `vite-plugin-svgr` from deps → devDeps |
| `.gitignore` | Removed duplicate `.DS_Store` entry |
| `.vscode/settings.json` | Enabled `rust-analyzer.checkOnSave` with clippy |
| `sona.rs:296` | Temperature `0.0` no longer silently dropped (`> 0.0` → `>= 0.0`) |

### 9. Medium fixes — robustness & deduplication

| File | Change |
|------|--------|
| `cmd/audio.rs` | Device ID: switched from index-based (`nth(id)`) to name-based lookup — stable across device changes |
| `cmd/audio.rs` | Merge logic: generalized from hardcoded 0/1 indices to filter non-empty files, works with any number of devices |
| `cmd/transcribe.rs:145` | Stream errors now returned to caller instead of silently swallowed |
| `cmd/transcribe.rs:126-127` | Integer truncation → rounding (`(x * 100.0).round() as i64`) |
| `sona.rs:170-174` | Stderr buffer: replaced hard 8KB cutoff with 16KB ring buffer that drains oldest lines |
| `cmd/download.rs` | Extracted shared `download_stream` helper, `download_model` and `download_file` are now thin wrappers |
| `Cargo.toml` | Pinned eyre fork to commit `8a0b71c` instead of floating branch |

### 10. Concurrency & React state fixes

| File | Change |
|------|--------|
| `cmd/sona_cmd.rs` | Refactored `load_model` into 4 phases: check+spawn (lock), HTTP load (lock), GPU fallback (lock), update state (lock). Lock held briefly per phase instead of across entire function |
| `cmd/app.rs` | `type_text`: `std::thread::sleep` → `tokio::time::sleep`, made function `async` |

**React state:**

| File | Change |
|------|--------|
| `preference.tsx` | `useContext(X) as Type` → null check + descriptive `throw new Error` |
| `hotkey.tsx` | Same null context cast fix |
| `toast.tsx` | Same null context cast fix |
| `params.tsx` | Removed `usePreferenceProvider` — all reads/writes now go through `options`/`setOptions` props. Single source of truth, no stale closures |

---

## Remaining Issues

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

### MEDIUM

No remaining medium issues.

### LOW

| # | File | Issue |
|---|------|-------|
| 14 | `cmd/permissions.rs:2-4` | Stub always returns `true` |
| 15 | `components/ui/select.tsx`, `popover.tsx`, `scroll-area.tsx`, `card.tsx` | Use 2-space indentation instead of tabs |
| 16 | Various UI files | Hardcoded English strings bypass i18n (`"Settings"`, `"Output"`, etc.) |
