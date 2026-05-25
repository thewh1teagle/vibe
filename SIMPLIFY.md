# Simplify Plan: Dictation-Only

Goal: strip Vibe down to only global dictation via hotkey. Target: **Windows only**.

Branches: `simplify-dictation-only` (merged), `simplify-rust-backend` (current)

## Status: [x] Builds ✓ [x] Frontend done [x] Rust backend done [ ] Deps [ ] i18n

### Pre-work fix

- [x] Replaced private `thewh1teagle/cpal` fork → upstream `cpal = "0.17"` (Windows unaffected)

---

## Phase 1-3: Frontend Simplification ✓

### Deleted (28 files)
| Dir/File | Reason |
|----------|--------|
| `pages/batch/` (4 files) | Batch transcribe |
| `pages/home/audio-input.tsx` | File drop zone |
| `pages/home/audio-player.tsx` | Inline audio player |
| `pages/home/progress-panel.tsx` | Progress bar |
| `pages/home/audio-visualizer.tsx` | Waveform |
| `components/advanced-transcribe.tsx` | Dead code |
| `components/audio-device-input.tsx` | Hotkey uses default mic |
| `components/drop-modal.tsx` | Drag-drop |
| `components/format-select.tsx` | Format picker |
| `components/format-multi-select.tsx` | Multi-format |
| `components/html-view.tsx` | HTML preview |
| `components/resummarize-dialog.tsx` | Re-summarize |
| `components/text-area.tsx` | Transcript output |
| `components/page-transition.tsx` | Animation |
| `components/updater-progress.tsx` | Update toast |
| `lib/llm/` (4 files) | Claude/Ollama/OpenAI |
| `lib/ytdlp.ts` | YouTube download |
| `lib/docx.ts` | DOCX export |
| `lib/prompt-templates.ts` | LLM prompts |
| `lib/use-deep-links.tsx` | Deep links |
| `lib/use-confirm-exit.ts` | Exit guard |
| `lib/media.ts` | File validation |
| `lib/analytics.ts` | Telemetry |
| `lib/use-store-value.ts` | Unused hook |
| `lib/keep-awake.ts` | Sleep prevention |
| `lib/permissions.ts` | Audio permissions |
| `providers/files-provider.tsx` | File state |
| `providers/updater.tsx` | Auto-update |

### Simplified
| File | What changed |
|------|--------------|
| `app.tsx` | Removed batch route, updater + file providers |
| `home/page.tsx` | Tabs removed. Now: language + dictation dialog + model options only |
| `home/view-model.ts` | 693→70 lines. Only model check + crash check |
| `providers/hotkey.tsx` | Removed LLM summarization |
| `providers/preference.tsx` | 302→130 lines. Removed: llm, ffmpeg, yt-Dlp, diarize, timestamps, analytics, text formats |
| `components/params.tsx` | 622→196 lines. Removed: LLM, diarize, timestamps, FFmpeg, presets, translate, word-timestamps |
| `components/language-input.tsx` | Only 3 options: Auto, English, Dansk |
| `components/layout.tsx` | Removed drop-modal, page-transition, updater refs |
| `components/app-menu.tsx` | Removed updater (now just Settings + Back) |
| `settings/page.tsx` | Removed: sound/focus, recording path, yt-dlp, API server, general, analytics, advanced |
| `settings/view-model.ts` | 264→85 lines. Only model/GPU/settings |

---

## Phase 4: Rust Backend Cleanup ✓

### Deleted (8 files)
| File | Reason |
|------|--------|
| `analytics.rs` | Telemetry |
| `cleaner.rs` | Temp/log cleanup |
| `cli.rs` | CLI mode |
| `custom_protocol.rs` | vibe:// handler |
| `dock.rs` | macOS dock control |
| `diagnostics.rs` | App diagnostics |
| `cmd/ui.rs` | Progress bar helper |
| `cmd/ytdlp.rs` | YouTube download |

### Simplified
| File | What changed |
|------|--------------|
| `main.rs` | Removed 8 module declarations, aptabase plugin init, ytdlp/analytics commands |
| `setup.rs` | Removed cli, diagnostics, cleaner, custom_protocol refs |
| `cmd/mod.rs` | Removed `pub mod ui` and `pub mod ytdlp` |
| `cmd/app.rs` | Removed dead functions: get_commit_hash, get_logs_folder, show_log_path, show_temp_path, get_logs, get_cargo_features, track_analytics_event |
| `cmd/files.rs` | Removed get_argv |
| `cmd/sona_cmd.rs` | Removed analytics tracking call |
| `cmd/transcribe.rs` | Removed set_progress_bar calls |
| `cmd/download.rs` | Removed set_progress_bar calls |

### Removed plugins/deps
- `tauri-plugin-aptabase` (Rust deps)
- `tauri-plugin-deep-link` (Rust deps + capabilities)
- `tauri-plugin-updater` (Rust deps + capabilities)

---

## Phase 5: Dependencies & Config [ ]

- [ ] `desktop/src-tauri/Cargo.toml` — Remove remaining unused plugins and deps
- [ ] `desktop/package.json` — Remove unused npm deps: `docx`, `framer-motion`, `react-markdown`, `format-duration`, `date-fns`
- [ ] `tauri.conf.json` — Remove unused bundle targets (deb, rpm, dmg, app) + `sona-diarize` external bin

## Phase 6: i18n & Assets [ ]

- [ ] Prune unused translation keys from locales
- [ ] Remove unused language codes from `i18n.ts`
- [ ] Remove unused SVG icons

---

## What Remains in the App

**Main page:** Language picker (auto/en/da) → Dictation dialog (hotkey toggle, shortcut, clipboard/type) → More options (model params)

**Settings:** Language + Theme → Model download/select + GPU device

**Setup:** Model download wizard (first run)

**Core:** Global hotkey press → record from default mic → stop → Whisper transcribe → clipboard or type-at-cursor
