# Code Quality Review

## Status (2026-06-20)

| Metric           | Count |
| ---------------- | ----- |
| Open             | 3     |
| Fixed since last | 34    |
| New              | 0     |

---

## 2026-06-20 (fix pass)

All 37 findings from the initial review were addressed on branch `fix/code-quality-review`. 34 were fixed and verified (manual testing + `cargo clippy`, `cargo test`, `pnpm check-types`, `pnpm format:check` all pass). 3 remain open by design (see below).

### Fixed since 2026-06-20

#### High (bug risk)

- ~~`desktop/src-tauri/src/setup.rs:42` — `CrashHandler` is bound to `_handler` and dropped at the end of `setup()`, detaching the handler immediately.~~ Fixed: handler now kept alive for the process lifetime via `std::mem::forget(handler)`.
- ~~`desktop/src-tauri/src/cmd/audio.rs:160` — ffmpeg `normalize(...)` failure is swallowed by `.log_error()`, but the code keeps using `normalized` (which may not exist).~~ Fixed: normalize/merge failures now emit a `record_error` event and return early instead of emitting a path to a nonexistent file.
- ~~`desktop/src-tauri/src/cmd/audio.rs:115-213` — the `once("stop_record", …)` closure swallows every critical operation via `.log_error()`.~~ Fixed: closure refactored with proper error propagation; extracted `save_recording_to_documents` helper; fatal steps return early with `record_error`.
- ~~`desktop/src-tauri/src/setup.rs:20,22` — `fs::create_dir_all(...).unwrap_or_else(|_| panic!(...))` panics on recoverable filesystem error.~~ Fixed: panics replaced with `Result` propagation via `.map_err()`.

#### Medium (maintainability)

- ~~`desktop/src-tauri/src/cmd/audio.rs:115-213` — the `stop_record` closure is ~100 lines with 4–5 levels of nesting (SOLID violation).~~ Fixed: extracted `save_recording_to_documents()` helper; closure now has clear numbered steps.
- ~~`desktop/src-tauri/src/cmd/audio.rs:124,125,133` — inconsistent indentation inside the stop callback.~~ Fixed: indentation normalized to 4-width tabs.
- ~~`desktop/src-tauri/src/setup.rs:90-92` — main window build failure is only logged.~~ Fixed: error now returned from `setup()`.
- ~~`desktop/src-tauri/src/cmd/sona_cmd.rs:118` — `state_guard.process.as_mut().unwrap()` panics if `respawn_sona` left `process` as `None`.~~ Fixed: `.context("sona process missing after respawn")?`.
- ~~`desktop/src-tauri/src/groq.rs:44` — `build().unwrap_or_default()` silently drops the timeout.~~ Fixed: `groq_client()` now returns `Result`; timeout can no longer be silently lost.
- ~~`desktop/src-tauri/src/sona.rs:233` — `let body = resp.text().await...` shadows the outer `body`.~~ Fixed: renamed to `resp_body`.
- ~~`desktop/src/components/error-modal.tsx:62` — `setState?.(...)` uses optional chaining on a required prop.~~ Fixed: removed the `?.`.
- ~~`desktop/src/lib/i18n.ts:30` — `const translations: any = {}` loosens typing.~~ Fixed: typed as `Record<string, Record<string, unknown>>`; eslint-disable removed.
- ~~`desktop/src/pages/setup/view-model.ts:32` — `handleProgressEvents` listener leak on unmount + double-registration.~~ Fixed: made async with `await listen(...)`, guards against double-registration.
- ~~`desktop/src/providers/preference.tsx:108` — `setLanguageDefaults` reads from `preference.*` inside the same `useMemo` (circular self-reference).~~ Fixed: now reads directly from the `language` and `modelOptions` state hooks.
- ~~`desktop/src-tauri/src/ffmpeg.rs:100,140` — variable named `pid` holds a `Child`, not a PID.~~ Fixed: renamed to `child` in both `normalize` and `merge_wav_files`.
- ~~`desktop/src-tauri/src/cmd/app.rs:49,55` — `"crash.txt"` magic strings duplicated; `.context("Can't delete file")` wrong on a rename.~~ Fixed: extracted `CRASH_FILENAME`/`CRASH_FILENAME_OLD` constants; context message corrected.

#### Low (style)

- ~~`desktop/src-tauri/src/ffmpeg.rs:80,91,117,122,124` — `.context("tostr")?` terse error strings.~~ Fixed: replaced with descriptive `"failed to convert ... path to UTF-8"`.
- ~~`desktop/src-tauri/src/sona.rs:89` — `let args = vec![...]` needlessly allocates a `Vec`.~~ Fixed: `cmd.args(["serve", "--port", "0"])`.
- ~~`desktop/src-tauri/src/sona.rs:168` and `desktop/src-tauri/src/cmd/download.rs:14` — magic numbers `16384` and `2MB`.~~ Fixed: extracted `STDERR_BUFFER_CAP` and `DOWNLOAD_PROGRESS_THRESHOLD` constants.
- ~~`desktop/src-tauri/src/sona.rs:218,228` — retry magic numbers `3` attempts and backoff.~~ Fixed: extracted `LOAD_MODEL_MAX_ATTEMPTS` constant.
- ~~`desktop/src-tauri/src/cmd/app.rs:11,67` — hardcoded connectivity targets and `100ms` sleep.~~ Fixed: extracted `ONLINE_CHECK_TARGETS` and `TYPE_TEXT_FOCUS_DELAY_MS` constants.
- ~~`desktop/src-tauri/src/cmd/audio.rs:103` — `let writer_2 = writer.clone();` numbered-suffix naming.~~ Fixed: renamed to `writer_for_stream`.
- ~~`desktop/src-tauri/src/cmd/mod.rs:55` — `let flag_c = flag.clone();` abbreviated name.~~ Fixed: renamed to `abort_flag`.
- ~~`desktop/src-tauri/src/setup.rs:60` — crash dialog "Github" typo + confusing message.~~ Fixed: "GitHub"; reworded to "Please report this on GitHub."
- ~~`desktop/src-tauri/src/logging.rs:35` — leftover `TODO: remove?` comment.~~ Fixed: removed.
- ~~`desktop/src-tauri/src/logging.rs:42` — unnecessary `path.clone()`.~~ Fixed: `&path`.
- ~~`desktop/src-tauri/src/tray.rs:14` — `unwrap()` panics if no default icon.~~ Fixed: `ok_or_else(|| eyre!("missing default window icon"))?`; return type changed to `eyre::Result`.
- ~~`desktop/src/pages/setup/view-model.ts:72,76,82,89` — `console.log` debug logging.~~ Fixed: removed `console.log` debug lines (kept `console.error` for genuine error handling).
- ~~`desktop/src/components/language-input.tsx:6` — hardcoded language list duplicates data.~~ Fixed: moved to shared `transcriptionLanguages` constant in `lib/config.ts`.
- ~~`desktop/src/pages/settings/page.tsx:107` — `key={index}` for model list.~~ Fixed: `key={model.path}`.
- ~~`desktop/src/lib/app.ts:26` — `getIssueUrl` hardcodes `assignees=octocat` placeholder.~~ Fixed: removed placeholder assignee.
- ~~`desktop/src/lib/app.ts:6` — `localStorage.getItem('prefs_model_path')` duplicates the key literal.~~ Fixed: shared `PREF_KEY_MODEL_PATH` constant in `lib/config.ts`, used in `app.ts`, `logs.ts`, and `preference.tsx`.
- ~~`desktop/src/providers/hotkey.tsx:104` — inline `load_model` + `transcribe` + output + notify (multiple responsibilities).~~ Fixed: extracted `processTranscription(path)` function.
- ~~`desktop/src-tauri/src/ffmpeg.rs:73` — `normalize` is a vague name.~~ Fixed: kept the name but added a doc comment documenting the 16 kHz mono PCM s16le contract.

### Still open (from 2026-06-20)

- `desktop/src-tauri/src/error.rs:1` + widespread usage — the `LogError` trait still enables error swallowing in best-effort paths (`main.rs:31-33`, `cmd/download.rs:29`). Specific high-impact usages in `cmd/audio.rs` were fixed, but the trait itself remains. Deferred: reserving `log_error` for truly best-effort ops only would require auditing every call site.
- `desktop/src/pages/home/view-model.ts:59` and `desktop/src/pages/settings/view-model.ts:93` — `useEffect` with empty/incomplete dependency arrays (stale-closure risk). Deferred: these are intentional one-time-mount effects; fixing requires adding an exhaustive-deps eslint rule or refactoring to refs, which is a larger change.
- `desktop/src-tauri/src/main.rs:81` — `.expect("error while building tauri application")` panics on build failure. Deferred: acceptable at startup where a failed build is unrecoverable.

---

## 2026-06-20 (initial review)

First review of the Vibe codebase (Tauri v2 Rust backend + React/TS frontend + Python build script).
Scope: `desktop/src-tauri/src/**`, `desktop/src/**` (excluding generated `components/ui`), `scripts/pre_build.py`.
UI primitives in `desktop/src/components/ui/` are shadcn/ui-generated and were only lightly scanned.

Findings are grouped by severity (high → medium → low) with concrete suggestions.

### Findings

#### High (bug risk)

- `desktop/src-tauri/src/setup.rs:42` — `CrashHandler` is bound to `_handler` and dropped at the end of `setup()`, detaching the handler immediately. In `crash-handler` 0.7, `Drop` for `CrashHandler` calls `detach`, so the crash dialog only exists during setup and is gone for the app's lifetime — the opposite of the intent. Suggestion: keep the handler alive for the whole process (e.g. `std::mem::forget(handler)` or store in a `OnceLock<CrashHandler>` static), or return it to `main` and hold there.

- `desktop/src-tauri/src/cmd/audio.rs:160` — ffmpeg `normalize(...)` failure is swallowed by `.log_error()`, but the code keeps using `normalized` (which may not exist) for the documents copy/move and the `record_finish` payload. The frontend then tries to transcribe a missing file, producing a confusing downstream "audio file not found" error instead of the real normalization failure. Suggestion: propagate the error; on failure emit a `record_error` event (or skip `record_finish`) rather than a path to a non-existent file.

- `desktop/src-tauri/src/cmd/audio.rs:115-213` — the `once("stop_record", …)` closure swallows every critical operation via `.log_error()` (merge, normalize, mkdir, move, copy, cleanup, final emit). Combined with the finding above, the user gets no signal that recording/processing failed and the emitted path can point to a missing or un-merged WAV. Suggestion: collect errors and surface them to the UI (e.g. a `record_error` event), returning early on fatal steps.

- `desktop/src-tauri/src/setup.rs:20,22` — `fs::create_dir_all(...).unwrap_or_else(|_| panic!("cant create ..."))` panics the app on a recoverable filesystem error (permissions, disk full, read-only). Suggestion: return `Result<>` and propagate with `?` / `.context(...)?`.

#### Medium (maintainability)

- `desktop/src-tauri/src/error.rs:1` + widespread usage — the `LogError` trait (`Result<T,E>` → `Option<T>`, logging the error) enables systematic error swallowing. Across `cmd/audio.rs`, `main.rs:31-33`, `cmd/download.rs:29`, callers drop the `None` and discard failures. Suggestion: reserve `log_error` for truly best-effort ops (logging, cleanup) and use `?`/propagation for ops whose failure matters.

- `desktop/src-tauri/src/cmd/audio.rs:115-213` — the `stop_record` closure is ~100 lines with 4–5 levels of nesting and mixes merging, normalization, documents-save, fallback copy, cleanup, and event emission (SOLID violation: one closure doing 5 jobs). Suggestion: extract `pick_or_merge_wav()`, `save_to_documents()`, `cleanup_temp_files()` helpers.

- `desktop/src-tauri/src/cmd/audio.rs:124,125,133` — inconsistent indentation inside the stop callback. Line 124 is under-indented relative to its siblings; lines 125 & 133 introduce an extra tab level. Violates the 4-width-tab convention from `.editorconfig` and hurts readability of an already complex block.

- `desktop/src-tauri/src/setup.rs:90-92` — main window build failure is only logged: `if let Err(error) = result { tracing::error!(...); }` then `Ok(())` is returned. The app proceeds with no main window; later `get_webview_window("main")` calls return `None` and features silently no-op. Suggestion: return the error from `setup()`.

- `desktop/src-tauri/src/cmd/sona_cmd.rs:118` — `state_guard.process.as_mut().unwrap()` panics if `respawn_sona` left `process` as `None`. `respawn_sona` does set it, but the coupling is fragile. Suggestion: `.context("sona process missing after respawn")?`.

- `desktop/src-tauri/src/groq.rs:44` — `reqwest::Client::builder().timeout(GROQ_TIMEOUT).build().unwrap_or_default()` silently drops the timeout if the builder fails; a hung Groq request could then block indefinitely. Suggestion: propagate the builder error, or re-apply `GROQ_TIMEOUT` to the default client.

- `desktop/src-tauri/src/sona.rs:233` — `let body = resp.text().await.unwrap_or_default();` shadows the outer `body` (`serde_json::Value` at line 210) with a `String` of the same name in one function. Suggestion: rename the second binding to `resp_body`.

- `desktop/src/components/error-modal.tsx:62` — `setState?.({ log: '', open: false })` uses optional chaining on `setState`, which is typed as a required prop (`ModifyState<ErrorModalState>`). This is misleading dead-defensiveness and is inconsistent with line 39 where `setState(...)` is called directly. Suggestion: remove the `?.`.

- `desktop/src/lib/i18n.ts:30` — `const translations: any = {}` (with an `eslint-disable` on the line above) loosens typing of the translation map. Suggestion: type as `Record<string, Record<string, unknown>>` or use i18next's `Resource` type.

- `desktop/src/pages/home/view-model.ts:59` and `desktop/src/pages/settings/view-model.ts:93` — `useEffect` with empty/incomplete dependency arrays that read `preference`/`navigate`/`loadModels` etc. Stale-closure risk. Suggestion: intentionally disable the rule with an explanatory comment, or list deps / read from refs.

- `desktop/src/pages/setup/view-model.ts:32` — `handleProgressEvents` registers a `listen(...)` whose `unlisten` is assigned asynchronously; if the component unmounts before the promise resolves, the cleanup at lines 47-50 still sees `unlistenRef.current === null` and the listener leaks. `startDownload` can also call it repeatedly, stacking multiple listeners. Suggestion: `await listen(...)` before proceeding, and guard against double-registration.

- `desktop/src/providers/preference.tsx:108` — `setLanguageDefaults` reads `preference.displayLanguage` / `preference.setModelOptions` from inside the same `useMemo` that defines `preference` (circular self-reference). It works because the function is called later, but it is confusing. Suggestion: read directly from the underlying state hooks (`language`, `modelOptions`).

- `desktop/src-tauri/src/ffmpeg.rs:100,140` — variable named `pid` actually holds a `Child` (process handle), not a PID. Misleading in both `normalize` and `merge_wav_files`. Suggestion: rename to `child` / `proc`.

- `desktop/src-tauri/src/cmd/app.rs:49,55` — `"crash.txt"` / `"crash.1.txt"` are magic strings duplicated across `is_crashed_recently` and `rename_crash_file`; the `.context("Can't delete file")` on the rename is wrong (it's a rename, not a delete); and `rename_crash_file` doesn't handle an already-existing `crash.1.txt`. Suggestion: extract `const CRASH_FILENAME`/`CRASH_FILENAME_OLD` and fix the context message.

#### Low (style)

- `desktop/src-tauri/src/ffmpeg.rs:80,91,117,122,124` — `.context("tostr")?` repeated terse error context strings. Suggestion: `.context("failed to convert path to UTF-8")?`.

- `desktop/src-tauri/src/sona.rs:89` — `let args = vec!["serve", "--port", "0"]; cmd.args(&args)` needlessly allocates a `Vec`. Suggestion: `cmd.args(["serve", "--port", "0"])`.

- `desktop/src-tauri/src/sona.rs:168` and `desktop/src-tauri/src/cmd/download.rs:14` — magic numbers `16384` (stderr buffer cap) and `1024 * 1024 * 2` (2MB progress threshold). Suggestion: extract named `const`s.

- `desktop/src-tauri/src/sona.rs:218,228` — retry magic numbers `3` attempts and `500 * (1 << attempt)` backoff. Suggestion: `const LOAD_MODEL_MAX_ATTEMPTS: u32 = 3;` plus a small backoff helper.

- `desktop/src-tauri/src/cmd/app.rs:11,67` — hardcoded `["1.1.1.1:80", ...]` connectivity targets and `Duration::from_millis(100)` sleep in `type_text`. Suggestion: lift to named `const`s and document the 100ms focus delay.

- `desktop/src-tauri/src/cmd/audio.rs:103` — `let writer_2 = writer.clone();` numbered-suffix naming. Suggestion: `writer_for_stream`.

- `desktop/src-tauri/src/cmd/mod.rs:55` — `let flag_c = flag.clone();` abbreviated name. Suggestion: `flag_clone` or `abort_flag`.

- `desktop/src-tauri/src/setup.rs:60` — crash dialog text has a "Github" typo and a confusing message: "Please register to Github and then click report." Suggestion: "GitHub"; reword for clarity.

- `desktop/src-tauri/src/logging.rs:35` — leftover `// Enable logs by default. TODO: remove?`. Suggestion: resolve or remove.

- `desktop/src-tauri/src/logging.rs:42` — unnecessary `path.clone()` in `OpenOptions::open(path.clone())`. Suggestion: `&path`.

- `desktop/src-tauri/src/tray.rs:14` — `app.default_window_icon().unwrap().clone()` panics if no default icon is configured. Suggestion: `.context("missing default window icon")?` and return `tauri::Result`.

- `desktop/src-tauri/src/main.rs:81` — `.expect("error while building tauri application")` panics on build failure. Acceptable at startup, but returning the `eyre` result via `?` would be consistent with the `main` signature.

- `desktop/src/pages/setup/view-model.ts:72,76,82,89` — `console.log`/`console.error` debug logging left in, inconsistent with the rest of the frontend which surfaces errors via the error modal. Suggestion: route through the logger / error modal.

- `desktop/src/components/language-input.tsx:6` — hardcoded language list (`auto`, `en`, `da`) diverges from `lib/i18n.ts` `supportedLanguages` and the backend's broader language support; duplicates language data. Suggestion: derive from a shared source.

- `desktop/src/pages/settings/page.tsx:107` — `key={index}` for model list items. Using the array index as a React key is fragile if the model list reorders/changes. Suggestion: `key={model.path}`.

- `desktop/src/lib/app.ts:26` — `getIssueUrl` hardcodes `assignees=octocat` (looks like a placeholder) and `template=bug_report.yaml`; the repo owner is also baked into the URL string. Suggestion: lift to named constants and drop/verify the `octocat` assignee.

- `desktop/src/lib/app.ts:6` — `localStorage.getItem('prefs_model_path')` reads a raw storage key, duplicating the literal used in `providers/preference.tsx:85`. Suggestion: share a `PREF_KEYS` constant module to avoid the two drifting apart.

- `desktop/src/providers/hotkey.tsx:104` — the `record_finish` `useEffect` body handles `load_model` + `transcribe` + output + notify inline (multiple responsibilities). Suggestion: extract a `processTranscription(path)` function for readability and testability.

- `desktop/src-tauri/src/ffmpeg.rs:73` — `normalize` is a vague name for a function that re-encodes audio to 16 kHz mono PCM s16le. Suggestion: `reencode_for_transcription` (or keep `normalize` but document the contract).

### Notes on positive patterns

- Error typing is good where it matters: `cmd/mod.rs` `CommandError` + `SonaApiError` propagate structured codes from sona to the frontend cleanly.
- `AbortGuard` (`cmd/mod.rs:46`) is a clean RAII pattern for unlistening on drop.
- `SonaProcess` `Drop` impl (`sona.rs:414`) guarantees the child is killed.
- Provider/context structure on the frontend is clean and consistent (`preference`, `hotkey`, `error-modal`).
- `pre_build.py` is well-structured with small named helpers and clear progress reporting.
