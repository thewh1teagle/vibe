# Simplify Plan: Dictation-Only

Goal: strip Vibe down to only global dictation via hotkey. Target: **Windows only**.

Branches: `simplify-dictation-only` (merged), `simplify-rust-backend` (current)

## Status: [x] All phases complete + final cleanup

### Pre-work fix

- [x] Replaced private `thewh1teagle/cpal` fork → upstream `cpal = "0.17"` (Windows unaffected)

---

## Phase 1-3: Frontend Simplification ✓

### Deleted (30 files)
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
| `components/dictation-dialog.tsx` | Replaced with inline controls |
| `components/app-menu.tsx` | Replaced with settings gear button |

### Simplified
| File | What changed |
|------|--------------|
| `app.tsx` | Removed batch route, updater + file providers |
| `home/page.tsx` | Tabs removed. Now: language + inline dictation controls (toggle/shortcut/output) in card |
| `home/view-model.ts` | 693→53 lines. Only model check + crash check |
| `providers/hotkey.tsx` | Removed LLM summarization |
| `providers/preference.tsx` | 302→130 lines. Removed: llm, ffmpeg, yt-Dlp, diarize, timestamps, analytics, text formats |
| `components/params.tsx` | 622→20 lines. Slim icon trigger button only (content moved to settings dialog) |
| `components/language-input.tsx` | Only 3 options: Auto, English, Dansk |
| `components/layout.tsx` | Centered mic icon + title, gradient background, polished design |
| `components/settings-modal.tsx` | Uses Radix Dialog for settings |
| `settings/page.tsx` | Renamed to page-window.tsx. Removed: theme picker, customize title, borders |
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

## Phase 5: Dependencies & Config ✓

- [x] `desktop/src-tauri/Cargo.toml` — Removed `url`, `urlencoding` crates
- [x] `desktop/package.json` — Removed 11 unused packages: `docx`, `framer-motion`, `react-markdown`, `format-duration`, `date-fns`, `next-themes`, `@formatjs/intl-durationformat`, `deep-link`, `updater`, `keepawake-api`, `npm-check-updates`
- [x] `tauri.conf.json` — Removed unused bundle targets (deb, rpm, dmg, app), sona-diarize bin, updater+deep-link plugin configs

## Phase 6: i18n & Assets ✓

- [x] Removed 21 unused SVG icons (kept 7 in use)
- [x] Pruned locales: 20 language dirs → en-US only
- [x] Simplified i18n.ts: single language, no OS detection
- [x] Removed language picker from settings

---

## What Remains in the App

**Main page (fancy-v1):** Centered mic icon + title → Language picker + model params + settings gear → Inline dictation controls (enable toggle, shortcut input, clipboard/type output) inside a rounded card

**Settings modal:** Model download/select + GPU device + model folder links

**More Options modal:** Model parameters (prompt, threads, temperature, sampling strategy, etc.)

**Setup:** Model download wizard (first run)

**Core:** Global hotkey press → record from default mic → stop → Whisper transcribe → clipboard or type-at-cursor

---

## Final Cleanup ✓

- [x] Removed `design/`, `docs/`, `samples/`, `website/`, `.skills/`, `plans/`
- [x] Removed `CONTRIBUTE.md`, `SECURITY.md`
- [x] Removed `desktop/src-tauri/tauri.linux.conf.json`, `tauri.macos.conf.json`, `Info.plist`, `entitlements.plist`
- [x] Removed 9 unused scripts from `scripts/` (kept only `pre_build.py`)
- [x] Removed release/website CI workflows (kept only `lint_rust.yml`)
- [x] Removed GitHub issue templates and FUNDING.yml
- [x] Updated root `package.json` (removed website from check-types)
- [x] Updated `AGENTS.md` and `README.md` for the simplified app
- [x] 162 files, 16,444 lines removed
