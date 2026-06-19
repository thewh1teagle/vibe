# Performance Review

## Status (2026-06-08)

| Metric           | Count |
| ---------------- | ----- |
| Open             | 29    |
| Fixed since last | 0     |
| New              | 29    |

---

## 2026-06-08

### HIGH severity

- `desktop/src-tauri/src/cmd/download.rs:12,24` — Sync file I/O in async function. `std::fs::File::create` and `write_all` block the Tokio worker thread during model downloads (potentially hundreds of MB). **Fix:** Replace with `tokio::fs::File`.
- `desktop/src/providers/preference.tsx:103-108,131-186` — `setLanguageDefaults` defined as plain function in component body, included in `useMemo` deps. Function reference changes every render → `useMemo` never stable → preference context value recreated every render → ALL context consumers re-render unconditionally. **Fix:** Wrap `setLanguageDefaults` in `useCallback`.
- `desktop/src/pages/setup/view-model.ts:30-48` — Memory leak. `listen('download_progress', ...)` called on every download retry without unregistering the previous listener. `unlistenRef.current` is overwritten, leaving prior listeners alive. Multiple retries accumulate callbacks. **Fix:** Call existing `unlistenRef.current?.()` before registering a new listener.
- `desktop/src-tauri/Cargo.toml:14` — `devtools` feature enabled unconditionally in Tauri dependency. DevTools IPC hooks stay loaded even in release builds, adding runtime overhead. **Fix:** Use conditional dependency: `cfg(debug_assertions)` for `devtools`.
- `desktop/src-tauri/tauri.conf.json:20` — `"csp": null` disables Content Security Policy entirely. Webview can load any resource, degrading both security and performance. Unintended resources (fonts, scripts, etc.) can be loaded at runtime. **Fix:** Set a strict CSP like `default-src 'self'; connect-src 'self' http://127.0.0.1:*;`.
- `desktop/src-tauri/tauri.conf.json:8` — `"withGlobalTauri": true` injects `window.__TAURI__` into every page. Cannot be tree-shaken, adds ~50KB of global JS bridge that's redundant with the `@tauri-apps/api` npm imports already in use. **Fix:** Set `"withGlobalTauri": false`.

### MEDIUM severity

- `desktop/src-tauri/src/cmd/audio.rs:159-205` — Sync file operations in `stop_record` event callback (ffmpeg normalize, create_dir_all, rename, copy, remove_file). Runs on Tauri event thread, blocking UI during post-recording processing. **Fix:** Wrap ffmpeg calls in `tokio::task::spawn_blocking`.
- `desktop/src-tauri/src/ffmpeg.rs:101,141` — `pid.wait()` blocks the calling thread until the ffmpeg subprocess exits. When called from `stop_record` event callback, holds the Tauri event thread. **Fix:** Use `tokio::process::Command` or `spawn_blocking`.
- `desktop/src-tauri/src/cmd/audio.rs:285-298` — Audio real-time callback writes samples via `hound::WavWriter` (disk I/O from audio callback thread) and uses `try_lock` which silently drops entire audio buffers on contention. Causes audible glitches. **Fix:** Use lock-free SPSC ring buffer between callback and a consumer task.
- `desktop/src-tauri/src/cmd/transcribe.rs:94` — `segment.clone()` on every transcription event. Clones heap-allocated `text: String` unnecessarily before pushing into `segments`. **Fix:** Push to `segments` first, then emit via reference (`segments.last().unwrap()`).
- `desktop/src/pages/home/page.tsx:18-19` + `view-model.ts:10,70-73` — `viewModel()` returns a new object `{ preference, isModelPreloading }` reference every render, breaking referential stability for any child receiving `vm` props. **Fix:** Memoize the return value with `useMemo` inside `viewModel()`.
- `desktop/src/providers/preference.tsx:110-123` — Cascading `useEffect` chain: language change triggers Effect B → `i18n.changeLanguage()` → `i18n.language` changes → Effect A → `setLanguageDefaults()` → `setModelOptions()` → extra re-render. Each language selection causes 2-3 unnecessary renders. **Fix:** Combine language + model-options update in a single flow.
- Global (`desktop/src/`) — Zero uses of `React.memo` across all components. Every parent re-render cascades through entire component tree. Key components: `Layout`, `LanguageInput`, `ModelOptions`, `SettingsModal`, `SettingsPage`, `ErrorModal`, `InfoTooltip` all re-render unconditionally. **Fix:** Add `React.memo` to frequently re-rendered leaf components.
- `desktop/src/components/params.tsx:60-65,82,145-149` — Spread operator `{ ...options, field: newValue }` creates new objects per keystroke. Inline arrow functions create new references every render. Dialog content with `ScrollArea` re-renders heavily. **Fix:** Use `useCallback` for handlers, consider `useReducer` for complex form state.
- `desktop/src/pages/settings/page.tsx:62-63` — `key={index}` for model list in SelectContent. If models list changes order, React re-renders/re-mounts items unnecessarily. **Fix:** Use `key={model.path}`.
- `desktop/src-tauri/tauri.conf.json:12-14` — Asset protocol scope `"allow": ["**"]` grants read access to every file. Unnecessary exposure if any untrusted content loads. **Fix:** Restrict to `"$APPDATA/**", "$RESOURCE/**"`.
- `desktop/vite.config.ts:13` — `svgo: false` skips SVG optimization at build time. Unoptimized SVGs carry redundant metadata. **Fix:** Set `svgo: true`.
- `desktop/vite.config.ts` (missing) — No explicit `build.rollupOptions.output.manualChunks`. Vite's default code splitting doesn't separate vendor libraries optimally for a desktop app. **Fix:** Add manual chunks for React, Radix UI, i18n vendor bundles.

### LOW severity

- `desktop/src-tauri/src/ffmpeg.rs:43-71` — `find_ffmpeg_path()` called by both `normalize` and `merge_wav_files` without caching. Each call does `which` query + up to 3 filesystem checks. **Fix:** Cache with `OnceLock`.
- `desktop/src-tauri/src/cmd/audio.rs:86,234` — Linear scan of audio devices via `host.devices().find(...)` each time. With <20 devices, negligible impact. **Fix:** Build `HashMap<String, Device>` once.
- `desktop/src-tauri/src/sona.rs:399-428` — `child.wait()` in `Drop` blocks thread. If `SonaState` is dropped on a Tokio worker, it stalls the entire runtime. **Fix:** Spawn detached thread or use `try_wait()`.
- `desktop/src-tauri/src/sona.rs:376` — New `Vec<Result<SonaEvent>>` allocated per HTTP chunk in streaming JSON parser. Acceptable for normal throughput but creates many short-lived allocations. **Fix:** Use streaming JSON parser for zero-copy.
- `desktop/src-tauri/src/sona.rs:379` — `String::drain(..n+1)` shifts remaining content O(remaining_length). Pathological case only with very long lines — negligible in practice.
- `desktop/src-tauri/src/cmd/download.rs:9` — `reqwest::Client::new()` per download call. Connection pool discarded after each download. **Fix:** Share a static `OnceLock<Client>`.
- `desktop/src-tauri/src/cmd/app.rs:65` — `Enigo::new()` created every `type_text` call, re-initializing platform input API connection. **Fix:** Cache in `OnceLock<Mutex<Enigo>>`.
- `desktop/src-tauri/src/cmd/sona_cmd.rs:107-109` — `tokio::sync::Mutex` held across `load_model` HTTP request (potentially seconds). Blocks concurrent commands but acceptable for single-user design.
- `desktop/src-tauri/src/cmd/audio.rs:133,145,151,159` — Redundant `PathBuf::clone()` calls in merge path. **Fix:** Mutate in place and pass `&Path` references.
- `desktop/src/pages/home/page.tsx:113-127` — Inline arrow functions in `.map()` for hotkey mode buttons (2 items). Prevents future optimization if list grows.
- `desktop/src/pages/home/page.tsx:27-35` — `showWindow` defined outside `useEffect` but captured in `[]` deps. Function reference wasted each render. **Fix:** Move inside `useEffect`.
- `desktop/src/pages/settings/page.tsx:2-4` — SVGs imported as `ReactComponent` (~500 bytes each). Minor bundle weight, inconsistent with inline SVG on line 34-45. **Fix:** Standardize icon import approach.
- `desktop/src/pages/setup/page.tsx:13` — `Array.find()` runs every render to look up current preset (3 items). Negligible.
- `desktop/src/providers/preference.tsx:6` — ~2KB `whisper-languages.json` eagerly bundled in main JS chunk. Trivial size.
- `desktop/vite.config.ts` (missing) — No explicit `build.target`. Defaults to `"modules"` which transpiles for older browsers. Tauri ships with modern Chromium (WebView2). **Fix:** Set `build.target: 'esnext'`.
- `Cargo.lock` — `aws-lc-rs` + `aws-lc-sys` pulled in as transitive deps (likely via `reqwest` TLS). App talks to sona over plain HTTP localhost. Unnecessary crypto library increases compile time and binary size. **Fix:** Use `reqwest` with `rustls-tls` or disable TLS for localhost client.
- `desktop/src-tauri/Cargo.toml:39-40` — Both `futures` and `futures-util` as separate dependencies. `futures` re-exports `futures-util`. **Fix:** Remove `futures-util`.
- `desktop/src-tauri/Cargo.toml:34` — `tokio` with `rt-multi-thread` spawns multiple OS threads for async executor. May be heavier than needed for I/O-bound dictation app. Consider `current_thread` if no CPU-heavy `tokio::spawn` usage.
- `desktop/src-tauri/Cargo.toml:53` — `crash-handler` included unconditionally in release builds, adding binary weight. **Fix:** Gate behind a feature flag.
