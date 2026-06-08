# Security Review

## Status (2026-06-08)

| Metric           | Count |
| ---------------- | ----- |
| Open             | 11    |
| Fixed since last | 0     |
| New              | 11    |

---

## 2026-06-08

### New findings

#### High severity

- `desktop/src-tauri/src/cmd/download.rs:38` — **Arbitrary file write via `download_model`**. The `download_model` Tauri command accepts `url` and `path` directly from the frontend with no server-side validation of either value. A compromised renderer process could call this IPC command with arbitrary values to overwrite any file the app process has write access to (e.g., write a malicious binary to the user's startup folder). **Fix**: validate `path` is within the app's models directory, validate `url` scheme is `https://` and domain is in an allowlist, and consider dropping file permissions after write.

- `desktop/src-tauri/src/cmd/audio.rs:163-164` — **Path traversal via `custom_path` in `start_record`**. User-provided `custom_path` from the frontend is used directly with `PathBuf::from(cp)` without sanitization. If local storage is manipulated or a renderer exploit occurs, recording files can be written to arbitrary locations (e.g., `../../Users/.../startup`). **Fix**: canonicalize the path, ensure it is within an allowed recordings directory, and reject paths containing `..` components.

#### Medium severity

- `desktop/src-tauri/src/sona_cmd.rs:134` — **Unvalidated model file path in `load_model`**. The `model_path` argument is only checked for file existence. No validation prevents path traversal (e.g., `../../etc/passwd`) or symlink following. The path is forwarded to the sona HTTP API which reads the file. **Fix**: canonicalize the path with `std::fs::canonicalize` and verify it's within the models directory.

- `desktop/src-tauri/src/sona_cmd.rs:157` — **`preload_model` has same path issue as `load_model`**. The `model_path` argument in `preload_model` is passed directly to `ensure_model_loaded` without validation. Same fix applies.

- `desktop/src-tauri/Cargo.toml:28` — **`tauri-plugin-http` with `unsafe-headers` feature enabled**. The `unsafe-headers` feature allows setting arbitrary HTTP headers from frontend JS. If any frontend code uses this plugin to make HTTP requests, it could bypass CORS-like restrictions and forge `Origin`, `Referer`, etc. headers for SSRF-style attacks. **Fix**: remove `unsafe-headers` feature unless specifically needed for Ollama integration (and document why).

- `Cargo.toml:6` — **`eyre` dependency pinned to GitHub fork** (`thewh1teagle/eyre`). The `eyre` crate is pulled from a personal GitHub fork rather than crates.io. This fork may diverge from mainstream, miss security patches, or receive untested changes. **Fix**: switch to the crates.io `eyre` if compatible; otherwise audit the fork's delta.

- `desktop/src/lib/logs.ts:26` — **Full model filesystem path exposed in diagnostics**. `collectLogs()` includes the absolute path of the local model file in logs that are intended for GitHub bug reports. This leaks the user's home directory structure and username. **Fix**: redact the base directory portion (e.g., `~/**/models/ggml-model.bin`).

- `desktop/src-tauri/src/error.rs:10` — **Error messages may leak internal paths**. The `tracing::error!` macro captures internal paths and system state, which are returned to the frontend in `CommandError::message`. A compromised renderer could invoke failing commands to probe the filesystem structure. **Fix**: sanitize error messages for the frontend; log full details server-side but return user-safe messages.

#### Low severity

- `desktop/src/lib/i18n.ts:46` — **`escapeValue: false` in i18next config**. Disables output escaping in i18n interpolation. While translation files are bundled JSON (no user input), if a future feature interpolates user text into translations, XSS would be possible in a web context. **Fix**: set `escapeValue: true` and pass raw HTML via a separate mechanism if needed.

- `desktop/src/pages/home/page.tsx:102` — **Unvalidated hotkey shortcut input**. The user-input hotkey string is passed directly to `tauri-plugin-global-shortcut::register()` without validation. Malformed or excessive hotkey registrations could cause crashes. **Fix**: validate the shortcut string format against expected patterns before registration.

- `desktop/src-tauri/src/setup.rs:42` — **Unsafe crash handler attachment**. `CrashHandler::attach(unsafe { ... })` uses an unsafe block to register a crash callback. While this is a standard pattern, a memory-safety issue in the crash handler could prevent clean error recovery. **Fix**: consider using a safer alternative or adding `# Safety` docs explaining invariants.

---

## Notes

- **False positive risk**: The `type_text` command (`desktop/src-tauri/src/cmd/app.rs:64`) accepts arbitrary text and types it via `enigo`. This is the app's core dictation feature — it must type arbitrary text. No change needed.
- **False positive risk**: `desktop/src-tauri/src/cmd/files.rs:5` (`open_path`) accepts a `PathBuf` from the frontend. Frontend calls only use paths from `get_models_folder`, so risk is minimal.
- **Scope limitation**: This review covers source code only. Dependency scanning (e.g., `cargo audit`, `pnpm audit`) was not run as part of this review but is recommended.
- **Attack surface**: The primary risk is a compromised Tauri webview (renderer) exploiting IPC commands that lack server-side validation. All high-severity findings follow this pattern.
