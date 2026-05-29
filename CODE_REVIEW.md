# Dead Code Review

**Date:** 2026-05-29
**Scope:** All source files in `desktop/src/` (TS/TSX) and `desktop/src-tauri/src/` (Rust), plus `desktop/src-tauri/Cargo.toml`

## Summary

| Category                     | Count  |
| ---------------------------- | ------ |
| Unused files                 | 3      |
| Dead context values          | 11     |
| Dead type exports            | 3      |
| Dead context (write-only)    | 1      |
| Unnecessary `pub` visibility | 4      |
| Unused Cargo dependencies    | 4      |
| **Total**                    | **26** |

## Findings

### Unused files

- `desktop/src/icons/chevron-right.svg` — never imported by any file
- `desktop/src/icons/chevron-left.svg` — never imported by any file
- `desktop/src/assets/success.mp3` — never imported by any file

### Dead context values (Preference provider)

These fields are defined in the `Preference` interface and provided via context, but no component ever reads or calls them:

- `desktop/src/providers/preference.tsx:11` — `soundOnFinish` (never read by consumers)
- `desktop/src/providers/preference.tsx:12` — `setSoundOnFinish` (never called by consumers)
- `desktop/src/providers/preference.tsx:13` — `focusOnFinish` (never read by consumers)
- `desktop/src/providers/preference.tsx:14` — `setFocusOnFinish` (never called by consumers)
- `desktop/src/providers/preference.tsx:22` — `setTheme` (never called by consumers; `theme` is read internally by the provider's useEffect)
- `desktop/src/providers/preference.tsx:23` — `storeRecordInDocuments` (never read by consumers)
- `desktop/src/providers/preference.tsx:24` — `setStoreRecordInDocuments` (never called by consumers)
- `desktop/src/providers/preference.tsx:25` — `customRecordingPath` (never read by consumers)
- `desktop/src/providers/preference.tsx:26` — `setCustomRecordingPath` (never called by consumers)
- `desktop/src/providers/preference.tsx:27` — `setLanguageDirections` (never called by consumers)
- `desktop/src/providers/preference.tsx:29` — `setGpuDevice` (never called by consumers; `gpuDevice` is read internally)

### Dead type exports

- `desktop/src/lib/transcript.ts:1` — `Duration` interface exported but never imported elsewhere
- `desktop/src/lib/transcript.ts:7` — `Transcript.processing_time` field defined but never accessed by consumers
- `desktop/src/lib/transcript.ts:9` — `Transcript.word_segments` field defined but never accessed by consumers

### Dead context (write-only)

- `desktop/src/providers/toast.tsx:14` — `ToastContext` provides state values (`open`, `message`, `progress`, setters) but no component ever reads them via a `useToast` hook. The context is write-only — `ToastProvider` writes values but nothing consumes them.

### Unnecessary `pub` visibility (Rust)

- `desktop/src-tauri/src/setup.rs:8` — `pub static STATIC_APP` only used within `setup.rs` (lines 29, 55). Should be private (no `pub`).
- `desktop/src-tauri/src/logging.rs:10` — `pub fn get_log_path` only called within `logging.rs` (line 38). Should be private (no `pub`).
- `desktop/src-tauri/src/sona.rs:38` — `pub enum SonaEvent` only used within crate (`cmd/transcribe.rs`). Could be `pub(crate)`.
- `desktop/src-tauri/src/sona.rs:71` — `pub struct SonaApiError` only used within crate (`cmd/transcribe.rs:79`, `sona.rs:357`). Could be `pub(crate)`. Fields `code` and `message` (lines 72-73) also only accessed in `cmd/transcribe.rs:81-82`.

### Unused Cargo dependencies

- `desktop/src-tauri/Cargo.toml:63` — `winreg = "0.55.0"` — no import or usage of `winreg`, `RegKey`, or `HKEY` found anywhere in the source.
- `desktop/src-tauri/Cargo.toml:65-68` — `windows = { version = "0.62.2", features = [...] }` — no `use windows` found. Comment says "Used to attach to console" but no code uses it. The `std::os::windows::process::CommandExt` usage in `sona.rs` and `ffmpeg.rs` is from the standard library, not this crate.
- `desktop/src-tauri/Cargo.toml:70` — `libc = "0.2.180"` — no `libc::` usage found anywhere.
- `desktop/src-tauri/Cargo.toml:71` — `libc-stdhandle = "=0.1.0"` — no usage found anywhere.

**Note:** `once_cell` (line 36) is used in `setup.rs:2` for `Lazy`. Since `std::sync::LazyLock` is stable since Rust 1.80, this dependency could be replaced with the standard library equivalent — but it's not dead, just replaceable.

## Previous Report Status

The previous review (documented in the `chore/remove-dead-code` branch) resolved all 28 findings. This new scan found **26 new findings**, primarily:

- Preference context fields that were exposed but never consumed by any component
- Unused SVG/audio assets
- Remnant Windows-specific Cargo dependencies from a removed console-attachment feature

## Remaining Issues (from previous reviews, still open)

### CRITICAL

| #   | File                    | Issue                                                                                                                                                                 |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `cmd/audio.rs:62-64`    | **Unsafe `Send + Sync` on `StreamHandle`** — no safety justification, potential data race if cpal changes internals                                                   |
| 2   | `tauri.conf.json:20`    | **CSP disabled (`null`)** — no defense against XSS. Attempted fix broke i18n; needs careful CSP that allows Tauri IPC protocols (`ipc:`, `asset:`, `tauri.localhost`) |
| 3   | `tauri.conf.json:12-14` | **Asset protocol scope `"**"`** — frontend can read any file on disk. Needs scoping to `$RESOURCE/\*\*` + app directories without breaking i18n                       |

### HIGH

| #   | File                | Issue                                                                                                                                         |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | `setup.rs:9`        | **Global `STATIC_APP` with `std::sync::Mutex`** — if crash occurs while another thread holds mutex, it's poisoned and crash dialog won't show |
| 5   | `tauri.conf.json:8` | **`withGlobalTauri: true`** — exposes entire Tauri IPC API on `window.__TAURI__` to any script. Requires CSP to be safe                       |

### LOW

| #   | File                                                                     | Issue                                                                  |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 14  | `components/ui/select.tsx`, `popover.tsx`, `scroll-area.tsx`, `card.tsx` | Use 2-space indentation instead of tabs                                |
| 15  | Various UI files                                                         | Hardcoded English strings bypass i18n (`"Settings"`, `"Output"`, etc.) |
