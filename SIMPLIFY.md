# Simplify Plan: Dictation-Only

Goal: strip Vibe down to only global dictation + in-app recording. Keep: language selection, mic+system audio, customizable hotkey, clipboard/type output, GPU acceleration. Target: **Windows only**.

## Status: [ ] Buildings? ✓

Built successfully on `simplify-dictation-only` branch with one fix:
- Replaced private `thewh1teagle/cpal` fork with upstream `cpal = "0.17"`
- Simplified `cmd/permissions.rs` (macOS-specific fork functions removed)

## Execution Order

### Phase 1: Safe Cuts (leaf files, no dependencies on them)

| # | File | Action | Status |
|---|------|--------|--------|
| 1 | `desktop/src/pages/batch/` | DELETE (entire dir) | [ ] |
| 2 | `desktop/src/components/advanced-transcribe.tsx` | DELETE | [ ] |
| 3 | `desktop/src/components/drop-modal.tsx` | DELETE | [ ] |
| 4 | `desktop/src/components/format-select.tsx` | DELETE | [ ] |
| 5 | `desktop/src/components/format-multi-select.tsx` | DELETE | [ ] |
| 6 | `desktop/src/components/html-view.tsx` | DELETE | [ ] |
| 7 | `desktop/src/components/resummarize-dialog.tsx` | DELETE | [ ] |
| 8 | `desktop/src/lib/llm/` | DELETE (entire dir) | [ ] |
| 9 | `desktop/src/lib/ytdlp.ts` | DELETE | [ ] |
| 10 | `desktop/src/lib/docx.ts` | DELETE | [ ] |
| 11 | `desktop/src/lib/prompt-templates.ts` | DELETE | [ ] |
| 12 | `desktop/src/lib/use-deep-links.tsx` | DELETE | [ ] |
| 13 | `desktop/src/lib/use-confirm-exit.ts` | DELETE | [ ] |
| 14 | `desktop/src/lib/media.ts` | DELETE | [ ] |
| 15 | `desktop/src/lib/analytics.ts` | DELETE | [ ] |
| 16 | `desktop/src/providers/files-provider.tsx` | DELETE | [ ] |
| 17 | `desktop/src/providers/updater.tsx` | DELETE | [ ] |
| 18 | `desktop/src/components/updater-progress.tsx` | DELETE | [ ] |
| 19 | `desktop/src/components/page-transition.tsx` | DELETE | [ ] |
| 20 | `desktop/src/lib/keep-awake.ts` | DELETE | [ ] |
| 21 | `desktop/src/icons/` unused icons | DELETE | [ ] |

### Phase 2: Import Cleanup (remove references to deleted files)

| # | File | Action | Status |
|---|------|--------|--------|
| 22 | `desktop/src/app.tsx` | Remove: batch route, updater/file providers, deleted component imports | [ ] |
| 23 | `desktop/src/pages/home/page.tsx` | Remove: file/link tabs, deleted component imports | [ ] |
| 24 | `desktop/src/pages/home/view-model.ts` | Strip: yt-dlp, file mode, drag-drop. Keep: record flow | [ ] |
| 25 | `desktop/src/providers/preference.tsx` | Remove: llmConfig, ytDlp, ffmpegOptions, textFormat*, homeTab, advancedTranscribe*, diarize, stableTimestamps, recentLanguages, analytics | [ ] |
| 26 | `desktop/src/providers/hotkey.tsx` | Remove: LLM summarize after transcription | [ ] |
| 27 | `desktop/src/providers/toast.tsx` | Simplify or delete | [ ] |
| 28 | `desktop/src/components/params.tsx` | Strip: LLM, diarization, stable timestamps, FFmpeg, presets. Keep: model options | [ ] |
| 29 | `desktop/src/components/text-area.tsx` | DELETE (dictation uses clipboard/type, not in-app display) or simplify | [ ] |
| 30 | `desktop/src/lib/transcript.ts` | Simplify: keep asText(), remove format converters | [ ] |

### Phase 3: Settings & Pages Cleanup

| # | File | Action | Status |
|---|------|--------|--------|
| 31 | `desktop/src/pages/settings/page.tsx` | Strip: theme, sound/focus, recording path, yt-dlp, API server, general links, analytics, advanced | [ ] |
| 32 | `desktop/src/pages/settings/view-model.ts` | Strip unused state | [ ] |
| 33 | `desktop/src/pages/setup/` | Keep: model download wizard | [ ] |
| 34 | `desktop/src/components/settings-modal.tsx` | Update for simplified settings | [ ] |
| 35 | `desktop/src/components/layout.tsx` | Remove unused components from layout | [ ] |
| 36 | `desktop/src/components/app-menu.tsx` | Simplify menu items | [ ] |

### Phase 4: Rust Backend Cleanup

| # | File | Action | Status |
|---|------|--------|--------|
| 37 | `desktop/src-tauri/src/cmd/ytdlp.rs` | DELETE | [ ] |
| 38 | `desktop/src-tauri/src/cmd/ui.rs` | DELETE | [ ] |
| 39 | `desktop/src-tauri/src/analytics.rs` | DELETE | [ ] |
| 40 | `desktop/src-tauri/src/cleaner.rs` | DELETE | [ ] |
| 41 | `desktop/src-tauri/src/cli.rs` | DELETE | [ ] |
| 42 | `desktop/src-tauri/src/custom_protocol.rs` | DELETE | [ ] |
| 43 | `desktop/src-tauri/src/dock.rs` | DELETE | [ ] |
| 44 | `desktop/src-tauri/src/diagnostics.rs` | DELETE | [ ] |
| 45 | `desktop/src-tauri/src/cmd/app.rs` | Strip: diagnostics commands | [ ] |
| 46 | `desktop/src-tauri/src/cmd/files.rs` | Simplify: keep get_default_recording_path, get_ffmpeg_path | [ ] |
| 47 | `desktop/src-tauri/src/main.rs` | Remove deleted modules and plugin registrations | [ ] |
| 48 | `desktop/src-tauri/src/setup.rs` | Remove analytics, cleaner, custom_protocol init | [ ] |

### Phase 5: Dependencies & Config

| # | File | Action | Status |
|---|------|--------|--------|
| 49 | `desktop/src-tauri/Cargo.toml` | Remove unused plugins and deps | [ ] |
| 50 | `desktop/package.json` | Remove unused npm deps | [ ] |
| 51 | `desktop/src-tauri/tauri.conf.json` | Remove unused plugin configs, bundle targets | [ ] |
| 52 | `desktop/src-tauri/capabilities/` | Clean up permissions for removed plugins | [ ] |

### Phase 6: i18n & Assets

| # | File | Action | Status |
|---|------|--------|--------|
| 53 | `desktop/src-tauri/locales/*/common.json` | Prune unused translation keys | [ ] |
| 54 | `desktop/src/lib/i18n.ts` | Remove unused language codes if any | [ ] |
| 55 | Unused icons in `desktop/src/icons/` | DELETE | [ ] |
| 56 | `desktop/src/assets/whisper-languages.json` | Keep (needed for language selector) | [ ] |
| 57 | `desktop/src/assets/success.mp3` | Keep (sound on finish) | [ ] |

## Kept (unchanged)

- `components/dictation-dialog.tsx` — dictation UI panel
- `components/language-input.tsx` — language selector
- `components/audio-device-input.tsx` — mic/speaker selection
- `components/info-tooltip.tsx`
- `components/error-modal.tsx`, `error-modal-with-context.tsx`, `boundary-fallback.tsx`
- `providers/hotkey.tsx` — global hotkey engine (simplify: remove LLM summarize)
- `providers/preference.tsx` — preferences (simplify)
- `providers/error-modal.tsx` — error handling
- `lib/i18n.ts`, `lib/config.ts`, `lib/types.ts`, `lib/sona-errors.ts`, `lib/transcript.ts`
- `lib/use-single-instance.tsx`
- `cmd/audio.rs` — audio recording
- `cmd/sona_cmd.rs` — sona process + model loading
- `cmd/transcribe.rs` — transcription
- `cmd/app.rs` — type_text, get_models_folder
- `cmd/files.rs` — get_default_recording_path, get_ffmpeg_path
- `cmd/download.rs` — model download
- `cmd/permissions.rs` — audio permissions
- `ffmpeg.rs` — audio normalization
- `sona.rs` — sona HTTP client
- `config.rs`, `error.rs`, `logging.rs`, `setup.rs`, `main.rs`
- `transcript.rs`
- `pages/setup/` — model download wizard
- All `ui/` primitives (button, switch, select, dialog, etc.)
- i18n infrastructure

## Notes

- **cpal fork**: Replaced `thewh1teagle/cpal` (private) with upstream `cpal = "0.17"`. macOS audio permissions won't work but Windows is unaffected.
- **sona-diarize**: Not needed for dictation, but kept in build config for now (removing it can come later).
- **LLM summarization**: Removed from hotkey provider and settings. Only Whisper transcription remains.
