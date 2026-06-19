# Deduplication Review

**Date:** 2026-05-29
**Scope:** All source files in `desktop/src/` (TS/TSX) and `desktop/src-tauri/src/` (Rust), excluding `components/ui/` (shadcn boilerplate), `node_modules/`, `dist/`, `build/`, `target/`.

## Summary

| Category             | Count  |
| -------------------- | ------ |
| Exact duplicates     | 0      |
| Near duplicates      | 4      |
| Similar patterns     | 8      |
| Duplicated types     | 1      |
| Duplicated constants | 1      |
| **Total**            | **14** |

## Findings

### Near duplicates

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

### Similar patterns

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

### Duplicated types

**13. `GpuDevice` defined in both Rust and TypeScript**

- `desktop/src-tauri/src/sona.rs:10-17` and `desktop/src/pages/settings/view-model.ts:13-18`
- This is expected (backend/frontend mirror types) — not actionable, but noting for completeness.

### Duplicated constants

**14. `localStorage.getItem('prefs_model_path')` direct access**

- `desktop/src/lib/logs.ts:29` reads localStorage directly instead of going through the preference provider.
- **Suggestion:** Use the preference provider or a shared `getModelPath()` utility to centralize access.

## Priority ranking

| Priority | Finding                              | Impact                                             |
| -------- | ------------------------------------ | -------------------------------------------------- |
| High     | #1 (ensure_model_loaded duplication) | Eliminates ~50 lines of near-identical async logic |
| High     | #5 (spawn-sona block 3×)             | Eliminates ~30 lines, reduces spawn bug surface    |
| High     | #4 (SonaApiError / CommandError)     | Eliminates type confusion and inline downcast      |
| Medium   | #6 (list models 4×)                  | Single source of truth for model listing           |
| Medium   | #8 (abort pattern)                   | RAII guard prevents unlisten bugs                  |
| Medium   | #2 (resolve_ffmpeg/diarize)          | Minor cleanup, improves consistency                |
| Low      | #3, #7, #9, #10, #11, #12, #14       | Small wins, low risk                               |
