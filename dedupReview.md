# Deduplication Review

## Status (2026-06-27)

| Metric             | Count |
| ------------------ | ----- |
| Open               | 12    |
| Fixed since last   | 5     |
| New                | 8     |

---

## 2026-06-27

### New findings

- `desktop/src/pages/settings/view-model.ts:82-91` and `desktop/src/pages/setup/view-model.ts:122-130` — near-identical `testGroqKey()` async function (only difference: `console.error` in catch). **Suggestion:** Extract `async function testGroqKey(apiKey: string): Promise<boolean>` into `~/lib/groq.ts` and let each view-model handle its own status state.
- `desktop/src/pages/settings/page.tsx:38-59` and `desktop/src/pages/setup/page.tsx:44-66` — Groq API key input block (label, description, "Get API key" link, password input, test button, status message) is duplicated nearly verbatim. **Suggestion:** Extract a `<GroqApiKeyInput value onChange onTest status />` component.
- `desktop/src/pages/settings/page.tsx:20-34` and `desktop/src/pages/setup/page.tsx:26-40` — "local / groq" provider toggle button group duplicated with identical markup and classes. **Suggestion:** Extract a `<ProviderToggle value onChange />` component.
- `desktop/src/pages/settings/view-model.ts:30-32` and `desktop/src/pages/setup/view-model.ts:136-138` — identical `openGroqConsole()` one-liner. **Suggestion:** Replace both with a direct call to `openUrl(config.groqConsoleURL)` at the call site, or export `openGroqConsole()` from `~/lib/config.ts`.
- `desktop/src/pages/home/page.tsx:22-25` and `desktop/src/pages/home/page.tsx:175-177` — same `{ CmdOrCtrl: 'Ctrl', Shift: 'Shift', Alt: 'Alt' }` shortcut-key mapping + `.split('+').map(...)` logic appears twice in the same file. **Suggestion:** Extract `formatShortcutKeys(shortcut: string): string[]` to `~/lib/shortcut.ts`.
- `desktop/src/components/params.tsx:51` and `desktop/src/components/settings-modal.tsx:13` — identical ~200-char Tailwind className string for a fullscreen dialog content. **Suggestion:** Extract to a shared constant `FULLSCREEN_DIALOG_CLASSES` or a `<FullscreenDialogContent>` wrapper.
- `desktop/src-tauri/src/cmd/sona_cmd.rs:131-139` and `desktop/src-tauri/src/cmd/sona_cmd.rs:154-161` — near-identical "model already loaded?" guard block in `load_model` and `preload_model` (only log message + return type differ). **Suggestion:** Extract `fn is_model_loaded(state: &SonaState, path: &str, gpu: u32) -> bool` and call from both.
- `desktop/src-tauri/src/sona.rs:267-283` and `desktop/src-tauri/src/groq.rs:58-68` — ~95% identical file-multipart-part construction (`tokio::fs::File` → `ReaderStream` → `reqwest::Body` → `multipart::Part::stream_with_length`). `groq.rs` already has it factored into `file_multipart_part()`; `sona.rs` inlines the same code. **Suggestion:** Make `file_multipart_part` `pub(crate)` in `groq.rs` (or move to a shared `http.rs` module) and have `sona.rs::transcribe_stream` call it.
- `desktop/src-tauri/src/sona.rs:287-345` and `desktop/src-tauri/src/groq.rs:76-102` — same "check option field, conditionally append to multipart form" pattern repeated for ~15 fields in `sona.rs` and 4 fields in `groq.rs`. **Suggestion:** Extract `fn apply_option_to_form(form, key, value) -> MultipartForm` helper (or a `FormBuilder` extension) and call once per field.
- `desktop/src-tauri/src/sona.rs:62-70`, `desktop/src-tauri/src/groq.rs:32-41`, and `desktop/src-tauri/src/cleanup.rs:242-250` — three near-identical `ApiErrorResponse` / `SonaErrorResponse` structs. `groq.rs` and `cleanup.rs` are byte-identical; `sona.rs` adds an optional `code` field. **Suggestion:** Define one `ApiErrorResponse` in a shared module (e.g. `http.rs`) with `code: Option<String>` and `message: String`; use it from all three files.
- `desktop/src-tauri/src/sona.rs:354-363`, `desktop/src-tauri/src/groq.rs:112-119`, and `desktop/src-tauri/src/cleanup.rs:272-278` — identical HTTP error-handling pattern: `if !status.is_success() { read body; try parse as ApiError; bail with structured or raw body }`. **Suggestion:** Extract `fn parse_http_error(status: StatusCode, body: String) -> eyre::Report` that takes the response and the error struct and returns a `Report`.
- `desktop/src-tauri/src/groq.rs:43-45` and `desktop/src-tauri/src/cleanup.rs:254` — both build a `reqwest::Client::builder().timeout(...).build()?` with different timeouts. **Suggestion:** Make `groq_client()` in `groq.rs` accept an optional `Duration` parameter and have `cleanup.rs` call it.

### Still open (from 2026-05-29)

- `desktop/src-tauri/src/sona.rs:73-85` and `desktop/src-tauri/src/cmd/mod.rs:17-43` — `SonaApiError` vs `CommandError` still have identical fields (`code`, `message`) and identical `Display` impl. The `From<eyre::Error>` bridge via downcast remains. **Suggestion:** Unify into one type — either alias `SonaApiError = CommandError`, or add `impl From<SonaApiError> for CommandError` and remove the manual downcast in `transcribe.rs`.
- `desktop/src-tauri/src/ffmpeg.rs:43-71` vs `desktop/src-tauri/src/cmd/sona_cmd.rs:63-65` — `find_ffmpeg_path()` (searches `which`, CWD, exe dir) and `resolve_ffmpeg_path()` (only checks Tauri resource dir) use divergent search strategies. **Suggestion:** Consolidate into one resolver that checks resource dir first, then falls back to the `ffmpeg.rs` strategy.
- `desktop/src-tauri/src/cmd/sona_cmd.rs:11-14` and `:58` plus `desktop/src-tauri/src/ffmpeg.rs:12-16` — platform-specific binary-name `cfg` blocks still appear 3×. **Suggestion:** `resolve_sona_binary` could be folded into `resolve_sidecar_binary` with extra search-path options, eliminating the second `cfg` block.
- `desktop/src-tauri/src/ffmpeg.rs:33-34` and `desktop/src-tauri/src/logging.rs:13-14` — identical `Local::now().format("%Y-%m-%d").to_string()` block. **Suggestion:** Extract `fn today_string() -> String` to a shared util module.
- `desktop/src/providers/preference.tsx:49-54` and `desktop/src/providers/hotkey.tsx:27-33` — `createContext<T | null>(null)` + `useXProvider()` null-guard throw still duplicated. (Note: the original review mentioned a `providers/toast.tsx` that no longer exists; only 3 providers exist now, and 2 share the boilerplate.) **Suggestion:** Extract a `createNullableContext<T>(name: string)` factory.
- `desktop/src/lib/logs.ts:25` — `localStorage.getItem(config.PREF_KEY_MODEL_PATH)` direct access (mitigated by using the config constant, but still bypasses the provider). **Suggestion:** Acceptable as a non-React utility module, or extract a non-hook `getModelPath()` helper.
- `desktop/src-tauri/src/cmd/sona_cmd.rs:70-73` and `:83-86` — minor residual duplication: the "resolve binary + resolve ffmpeg + spawn + store" 4-line block is now identical in `ensure_sona_spawned` and `respawn_sona`. **Suggestion:** Extract `fn spawn_and_store(state, app) -> Result<()>` helper.

### Fixed since 2026-05-29

- ~~`ensure_model_loaded` vs `ensure_model_loaded_with_fallback` in `cmd/sona_cmd.rs`~~ — duplicate removed; GPU fallback is now inside `ensure_model_loaded`.
- ~~`resolve_ffmpeg_path` vs `resolve_diarize_path` in `cmd/sona_cmd.rs`~~ — diarize path removed; `resolve_ffmpeg_path` now delegates to a generic `resolve_sidecar_binary` helper.
- ~~Spawn-sona-if-needed block repeated 3× in `cmd/sona_cmd.rs`~~ — centralized into `ensure_sona_spawned` / `respawn_sona`.
- ~~Abort/listen pattern in `cmd/download.rs` and `cmd/transcribe.rs`~~ — extracted into `AbortGuard` RAII struct in `cmd/mod.rs`.
- ~~`CREATE_NO_WINDOW` magic literal in `sona.rs`~~ — moved to `config::CREATE_NO_WINDOW`, used in both `ffmpeg.rs` and `sona.rs`.
- ~~`invoke('get_models_folder')` + `ls()` + `.filter('.bin')` repeated 4×~~ — consolidated into `listModels()` in `~/lib/fs.ts`; all 4 (now 5) consumers call it.
- ~~Transcript cleanup regex in `lib/transcript.ts:20-22` and `providers/hotkey.tsx`~~ — redundant cleanup in `hotkey.tsx` removed; cleanup lives only in `transcript.ts`.

---

## 2026-05-29 (previous)

**Date:** 2026-05-29
**Scope:** All source files in `desktop/src/` (TS/TSX) and `desktop/src-tauri/src/` (Rust), excluding `components/ui/` (shadcn boilerplate), `node_modules/`, `dist/`, `build/`, `target/`.

### Summary

| Category             | Count  |
| -------------------- | ------ |
| Exact duplicates     | 0      |
| Near duplicates      | 4      |
| Similar patterns     | 8      |
| Duplicated types     | 1      |
| Duplicated constants | 1      |
| **Total**            | **14** |

### Findings

#### Near duplicates

**1. `ensure_model_loaded` vs `ensure_model_loaded_with_fallback` (~95% identical)**

- `desktop/src-tauri/src/cmd/sona_cmd.rs:113-164` and `desktop/src-tauri/src/cmd/sona_cmd.rs:194-246`
- Both spawn sona if needed, try GPU load, on failure kill/respawn and retry with `no_gpu=true`. Only difference: return type (`Result<bool>` vs `Result<()>`).
- **Suggestion:** Delete `ensure_model_loaded_with_fallback`, make `ensure_model_loaded` return `Result<bool>`, have `preload_model` discard the bool.

**2. `resolve_ffmpeg_path` vs `resolve_diarize_path` (~95% identical)**

- `desktop/src-tauri/src/cmd/sona_cmd.rs:56-70` and `desktop/src-tauri/src/cmd/sona_cmd.rs:72-86`
- Identical structure: get resource dir, set platform binary name, join, check exists. Only the binary name differs.
- **Suggestion:** Extract `resolve_sidecar_binary(app_handle, name: &str) -> Option<PathBuf>` and call with `"ffmpeg"` / `"sona-diarize"`.

**3. Transcript text cleanup duplicated**

- `desktop/src/lib/transcript.ts:19-21` and `desktop/src/providers/hotkey.tsx:123`
- Both apply `.trim().replace(/^[.,!?;:\s]+/, '').trimEnd()` to clean transcript text. The hotkey provider does it on the already-cleaned `asText()` output (which internally does the same cleanup).
- **Suggestion:** Remove the redundant cleanup in `hotkey.tsx:123` — `asText()` already handles it.

**4. `SonaApiError` vs `CommandError` (structurally identical)**

- `desktop/src-tauri/src/sona.rs:70-82` and `desktop/src-tauri/src/cmd/mod.rs:12-31`
- Both have `code: String`, `message: String` fields and identical `Display` impl (`"[{}] {}"`). `CommandError` adds `Serialize` and `From<eyre::Error>`.
- **Suggestion:** Unify into one type. Either make `SonaApiError` a type alias for `CommandError`, or add `impl From<SonaApiError> for CommandError` and remove the manual `downcast_ref` in `transcribe.rs:78-87`.

#### Similar patterns

**5. Spawn-sona-if-needed block repeated 3×**

- `desktop/src-tauri/src/cmd/sona_cmd.rs:120-129`, `desktop/src-tauri/src/cmd/sona_cmd.rs:201-209`, and kill-respawn arms at `sona_cmd.rs:148-155` / `sona_cmd.rs:230-237`
- All do: lock state → check process is None → resolve binaries → spawn → store.
- **Suggestion:** Extract `async fn ensure_sona_spawned(state: &Mutex<SonaState>, app: &AppHandle) -> Result<()>` and `async fn respawn_sona(state: &Mutex<SonaState>, app: &AppHandle) -> Result<()>`.

**6. `invoke('get_models_folder')` + `ls()` + `.filter('.bin')` repeated 4×**

- `desktop/src/lib/logs.ts:23-27`
- `desktop/src/pages/home/view-model.ts:31-33`
- `desktop/src/pages/settings/view-model.ts:45-47`
- `desktop/src/pages/settings/view-model.ts:53-55`
- **Suggestion:** Extract `async function listModels(): Promise<NamedPath[]>` in `~/lib/fs.ts` or a new `~/lib/models.ts`.

**7. `find_ffmpeg_path` in `ffmpeg.rs` vs `resolve_ffmpeg_path` in `sona_cmd.rs`**

- `desktop/src-tauri/src/ffmpeg.rs:46-74` and `desktop/src-tauri/src/cmd/sona_cmd.rs:56-70`
- Both resolve the ffmpeg binary but with different search strategies. Having two resolution paths for the same binary is fragile.
- **Suggestion:** Consolidate into one `resolve_ffmpeg_path` that checks resource_dir first, then falls back to the `ffmpeg.rs` search strategy (which, CWD, exe dir).

**8. Abort/listen pattern repeated**

- `desktop/src-tauri/src/cmd/download.rs:43-47` and `desktop/src-tauri/src/cmd/transcribe.rs:67-72`
- Both create `Arc<AtomicBool>`, clone, listen for abort event, unlisten after work.
- **Suggestion:** Extract an `AbortGuard` RAII struct:
    ```rust
    struct AbortGuard { app: AppHandle, id: ListenerId, flag: Arc<AtomicBool> }
    impl AbortGuard { fn new(app: &AppHandle, event: &str) -> Self; fn is_aborted(&self) -> bool; }
    impl Drop for AbortGuard { fn drop(&mut self) { self.app.unlisten(self.id); } }
    ```

**9. Platform-specific binary name `cfg` blocks repeated 4×**

- `desktop/src-tauri/src/cmd/sona_cmd.rs:11-14`, `sona_cmd.rs:59-62`, `sona_cmd.rs:75-78`, `ffmpeg.rs:24-27`
- All do: `#[cfg(windows)] let name = "foo.exe"; #[cfg(not(windows))] let name = "foo";`
- **Suggestion:** Use `fn platform_binary(name: &str) -> String` or `if cfg!(windows) { format!("{}.exe", name) } else { name.to_string() }`.

**10. `CREATE_NO_WINDOW` constant + `CommandExt` import in two files**

- `desktop/src-tauri/src/ffmpeg.rs:20-21,29-30` (defines constant) and `desktop/src-tauri/src/sona.rs:102-106` (uses magic literal `0x08000000`)
- **Suggestion:** Define `CREATE_NO_WINDOW` once in a shared module (e.g. `config.rs` or a new `util.rs`) and import in both files.

**11. Provider boilerplate repeated 4×**

- `desktop/src/providers/hotkey.tsx:27-33`, `desktop/src/providers/preference.tsx`, `desktop/src/providers/toast.tsx`, `desktop/src/providers/error-modal.tsx`
- All follow: `createContext<T | null>(null)` + `useXProvider()` hook with null check + throw.
- **Suggestion:** Extract a generic `createProvider<T>()` factory:
    ```ts
    function createProvider<T>() {
    	const ctx = createContext<T | null>(null)
    	function useProvider() {
    		const v = useContext(ctx)
    		if (!v) throw new Error('useProvider must be used within Provider')
    		return v
    	}
    	return [ctx, useProvider] as const
    }
    ```

**12. Date formatting (`Local::now().format("%Y-%m-%d")`) in two files**

- `desktop/src-tauri/src/ffmpeg.rs:36-37` and `desktop/src-tauri/src/logging.rs:13-14`
- **Suggestion:** Extract `fn today_string() -> String` into a shared utility.

#### Duplicated types

**13. `GpuDevice` defined in both Rust and TypeScript**

- `desktop/src-tauri/src/sona.rs:10-17` and `desktop/src/pages/settings/view-model.ts:13-18`
- This is expected (backend/frontend mirror types) — not actionable, but noting for completeness.

#### Duplicated constants

**14. `localStorage.getItem('prefs_model_path')` direct access**

- `desktop/src/lib/logs.ts:29` reads localStorage directly instead of going through the preference provider.
- **Suggestion:** Use the preference provider or a shared `getModelPath()` utility to centralize access.

### Priority ranking

| Priority | Finding                              | Impact                                             |
| -------- | ------------------------------------ | -------------------------------------------------- |
| High     | #1 (ensure_model_loaded duplication) | Eliminates ~50 lines of near-identical async logic |
| High     | #5 (spawn-sona block 3×)             | Eliminates ~30 lines, reduces spawn bug surface    |
| High     | #4 (SonaApiError / CommandError)     | Eliminates type confusion and inline downcast      |
| Medium   | #6 (list models 4×)                  | Single source of truth for model listing           |
| Medium   | #8 (abort pattern)                   | RAII guard prevents unlisten bugs                  |
| Medium   | #2 (resolve_ffmpeg/diarize)          | Minor cleanup, improves consistency                |
| Low      | #3, #7, #9, #10, #11, #12, #14       | Small wins, low risk                               |
