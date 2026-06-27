# Dead Code Review

## Status (2026-06-27 cleanup)

| Metric           | Count |
| ---------------- | ----- |
| Open             | 0     |
| Fixed since last | 17    |
| New              | 0     |

Cleanup commit removes all findings from 2026-06-27 (and 2026-06-08). See "Fixed since 2026-06-27" below for what was deleted and where.

---

## 2026-06-27 (cleanup)

### Removed

**Frontend — 7 unused shadcn UI component files (deleted)**

- ~~`desktop/src/components/ui/card.tsx`~~ — removed
- ~~`desktop/src/components/ui/dropdown-menu.tsx`~~ — removed
- ~~`desktop/src/components/ui/tabs.tsx`~~ — removed
- ~~`desktop/src/components/ui/collapsible.tsx`~~ — removed
- ~~`desktop/src/components/ui/popover.tsx`~~ — removed
- ~~`desktop/src/components/ui/native-select.tsx`~~ — removed
- ~~`desktop/src/components/ui/badge.tsx`~~ — removed

**Frontend — unused state and preference fields**

- ~~`desktop/src/providers/hotkey.tsx:60` — `isHotkeyRecording` state, `HotkeyContextType.isHotkeyRecording` field, and all `setIsHotkeyRecording(...)` calls~~ — removed (`isHotkeyRecordingRef` kept for internal coordination)
- ~~`desktop/src/providers/preference.tsx:98-99` — `soundOnFinish` / `setSoundOnFinish`~~ — removed
- ~~`desktop/src/providers/preference.tsx:99` — `focusOnFinish` / `setFocusOnFinish`~~ — removed
- ~~`desktop/src/providers/preference.tsx:101-102` — `storeRecordInDocuments` / `setStoreRecordInDocuments` and `customRecordingPath` / `setCustomRecordingPath`~~ — removed (including `defaultOptions.storeRecordInDocuments`)
- ~~`desktop/src/providers/preference.tsx:62` — `ModelOptions.translate`~~ — removed (also removed `TranscribeOptions.translate` in Rust + the corresponding form field in `groq.rs:88-90` and `sona.rs:292-294`)

**Rust backend — unused dependencies**

- ~~`desktop/src-tauri/Cargo.toml:65-67` — `objc2` and `objc2-app-kit`~~ — removed

**Rust backend — unused Tauri command**

- ~~`desktop/src-tauri/src/cmd/app.rs:96-99` — `read_clipboard` command and its registration in `main.rs:82`~~ — removed

**Rust backend — unused struct field**

- ~~`desktop/src-tauri/src/groq.rs:16-21` — `GroqSegment.id` (was `#[allow(dead_code)]`)~~ — removed

### Kept (false positives in original report)

- `desktop/src/providers/preference.tsx:96` — `theme` / `setTheme`: listed in the 2026-06-27 report as "never used by any consumer", but actually consumed internally by the `useEffect` at line 112-118 to toggle the `dark` class on `document.documentElement`. Kept.
- `desktop/src-tauri/src/cmd/transcribe.rs:36-37` — `stable_timestamps` and `vad_model`: no UI source sets them today, but they map to sona multipart-form fields (`sona.rs:338-345`) and removing them risks breaking the sona request contract. Kept as future-use.

### Verification

- `cargo check --all-targets` — clean
- `cargo clippy --all-targets -- -D warnings` — clean
- `pnpm run check-types` — clean
- Net diff: **−422 / +1** across 16 files

---

## 2026-06-27 (audit)

### Fixed since 2026-06-08

- ~~`desktop/src/components/ui/badge.tsx` — `Badge`, `badgeVariants` exported but never imported by any other file~~ — deleted
- ~~`desktop/src/components/ui/popover.tsx` — `Popover`, `PopoverTrigger`, `PopoverContent` exported but never imported elsewhere~~ — deleted
- ~~`desktop/src/components/ui/dropdown-menu.tsx` — all 17 exports never imported by any other file~~ — deleted
- ~~`desktop/src/components/ui/tabs.tsx` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` exported but never imported elsewhere~~ — deleted
- ~~`desktop/src/components/ui/collapsible.tsx` — `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` exported but never imported elsewhere~~ — deleted
- ~~`desktop/src/components/ui/card.tsx` — `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardDescription`, `CardContent` exported but never imported elsewhere~~ — deleted
- ~~`desktop/src/components/ui/native-select.tsx` — `NativeSelect` exported but never imported elsewhere~~ — deleted

### New findings

**Frontend — unused state and preference fields exposed but never read by any consumer**

- `desktop/src/providers/hotkey.tsx:60` — state `isHotkeyRecording` (declared and updated at lines 92, 102, 163, 324) is never exposed via `HotkeyContextType` (interface at lines 16-25) and never destructured by any consumer. The state variable and all its `setIsHotkeyRecording(...)` calls are dead.
- `desktop/src/providers/preference.tsx:96` — `[theme, setTheme]` and the `theme` useState/useLocalStorage are exposed in `Preference` interface (lines 24-25) but never used by any consumer in `desktop/src`. Only consumed internally by the `useEffect` at line 112. — **false positive, kept**
- `desktop/src/providers/preference.tsx:98-99` — `[soundOnFinish, setSoundOnFinish]` declared and exposed in `Preference` interface (lines 14-15) but never used by any consumer in `desktop/src`
- `desktop/src/providers/preference.tsx:99` — `[focusOnFinish, setFocusOnFinish]` declared and exposed in `Preference` interface (lines 16-17) but never used by any consumer in `desktop/src`
- `desktop/src/providers/preference.tsx:101-102` — `[storeRecordInDocuments, setStoreRecordInDocuments]` and `[customRecordingPath, setCustomRecordingPath]` declared and exposed (lines 26-29) but never used by any consumer in `desktop/src`

**Frontend — possibly unused `ModelOptions` field**

- `desktop/src/providers/preference.tsx:62` — `translate?: boolean` is defined in the `ModelOptions` interface but never assigned in `defaultOptions` and never read by any UI. The `TranscribeOptions.translate` field is consumed by the Rust backend (`desktop/src-tauri/src/cmd/transcribe.rs:29`, `sona.rs:292`) but the frontend never sets it — it will always be `None`.

**Rust backend — unused dependencies**

- `desktop/src-tauri/Cargo.toml:65-67` — `objc2` and `objc2-app-kit` declared for macOS but never imported by any Rust source file (no `use objc2` or `use objc2_app_kit` anywhere in `src/`). Possibly intended for future macOS work; possibly dead.

**Rust backend — unused Tauri command**

- `desktop/src-tauri/src/cmd/app.rs:96-99` — `read_clipboard` Tauri command is registered in `main.rs:82` but never invoked by the frontend. The frontend uses `@tauri-apps/plugin-clipboard-manager` directly (e.g. `desktop/src/providers/hotkey.tsx:5, 213, 218`).

**Rust backend — unused struct field with `#[allow(dead_code)]`**

- `desktop/src-tauri/src/groq.rs:16-21` — `GroqSegment.id` is `#[allow(dead_code)]` and never read after deserialisation. Consider removing it from the struct if the API does not return it.

**Rust backend — unused `TranscribeOptions` fields (no UI source for them)**

- `desktop/src-tauri/src/cmd/transcribe.rs:36-37` — `TranscribeOptions.stable_timestamps` and `vad_model` are defined, sent to the sona binary in `sona.rs:338-345`, but the frontend `ModelOptions` interface (in `desktop/src/providers/preference.tsx:57-69`) has no `stableTimestamps` or `vadModel` field, and the home page view-model never sends these. They will always be `None` from the UI. — **kept, sona contract risk**

### Still open (from 2026-06-08)

- `desktop/src/components/ui/card.tsx` — `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardDescription`, `CardContent` exported but never imported by any other file
- `desktop/src/components/ui/dropdown-menu.tsx` — exports never imported by any other file (15 exports in current version; previous report said 17)
- `desktop/src/components/ui/tabs.tsx` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` exported but never imported elsewhere
- `desktop/src/components/ui/collapsible.tsx` — `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` exported but never imported elsewhere
- `desktop/src/components/ui/popover.tsx` — `Popover`, `PopoverTrigger`, `PopoverContent` exported but never imported elsewhere
- `desktop/src/components/ui/native-select.tsx` — `NativeSelect` exported but never imported elsewhere
- `desktop/src/components/ui/badge.tsx` — `Badge`, `badgeVariants` exported but never imported by any other file

### Fixed since 2026-06-08

- ~~`scripts/pre_build.py:177` — dead function `download_diarize()` defined but never called from `main()` or anywhere else~~

---

## 2026-06-08 (previous)

### Findings
- `desktop/src/components/ui/badge.tsx` — `Badge`, `badgeVariants` exported but never imported by any other file (shadcn/ui component, possibly intended for future use)
- `desktop/src/components/ui/popover.tsx` — `Popover`, `PopoverTrigger`, `PopoverContent` exported but never imported elsewhere
- `desktop/src/components/ui/dropdown-menu.tsx` — all 17 exports never imported by any other file
- `desktop/src/components/ui/tabs.tsx` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` exported but never imported elsewhere
- `desktop/src/components/ui/collapsible.tsx` — `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` exported but never imported elsewhere
- `desktop/src/components/ui/card.tsx` — `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardDescription`, `CardContent` exported but never imported elsewhere
- `desktop/src/components/ui/native-select.tsx` — `NativeSelect` exported but never imported elsewhere
- `scripts/pre_build.py:177` — dead function `download_diarize()` defined but never called from `main()` or anywhere else
