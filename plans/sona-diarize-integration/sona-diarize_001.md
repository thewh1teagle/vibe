# Integrate Diarization Support into Vibe

## Context
Sona now supports optional speaker diarization via `sona-diarize` binary + Sortformer model. We need to integrate this into Vibe so users can enable diarization from the UI, download the model, and get speaker-attributed transcription segments.

## 1. Packaging — `scripts/pre_build.py`

**Add `sona-diarize` to `SONA_ASSET_MAP` and download it alongside sona.**

The `sona-diarize` binaries are raw binaries (not archives), same as Linux sona. They live in the same GitHub release (`v0.1.1`).

Add a new asset map for diarize:
```python
DIARIZE_ASSET_MAP = {
    "aarch64-apple-darwin": "sona-diarize-darwin-arm64",
    "x86_64-unknown-linux-gnu": "sona-diarize-linux-amd64",
    "aarch64-unknown-linux-gnu": "sona-diarize-linux-arm64",
    "x86_64-pc-windows-msvc": "sona-diarize-windows-amd64.exe",
    # x86_64-apple-darwin: not available (ort lacks prebuilt binaries)
}
```

Add `download_diarize()` function mirroring `download_sona()` but simpler (always raw binary, no archive extraction). Downloads to `desktop/src-tauri/binaries/sona-diarize-{target-triple}[.exe]`.

Call it from `main()` after `download_sona()`.

**File:** `/Users/yqbqwlny/Documents/audio/vibe/scripts/pre_build.py`

## 2. Tauri Config — Bundle `sona-diarize`

Add to `externalBin`:
```json
"externalBin": ["binaries/sona", "binaries/sona-diarize"]
```

**Files:**
- `/Users/yqbqwlny/Documents/audio/vibe/desktop/src-tauri/tauri.conf.json`
- `/Users/yqbqwlny/Documents/audio/vibe/desktop/src-tauri/tauri.macos.conf.json`

## 3. Rust — Resolve `sona-diarize` binary & set env var

**Add `resolve_diarize_path()`** in `cmd/mod.rs`, same pattern as `resolve_ffmpeg_path()`: check resource dir, return `Option<PathBuf>`.

**In `SonaProcess::spawn()`** (`sona.rs`): accept optional `diarize_path` parameter, set `SONA_DIARIZE_PATH` env var (same as `SONA_FFMPEG_PATH` pattern).

**In `load_model()`** (`cmd/mod.rs`): pass `resolve_diarize_path()` result into `SonaProcess::spawn()`.

**In `TranscribeOptions`**: add `diarize_model: Option<String>` field.

**In `transcribe_stream()`** (`sona.rs`): if `diarize_model` is set, add `diarize_model` text part to the multipart form. Also add `response_format=verbose_json` (needed for speaker fields).

**In `SonaEvent`**: add optional `speaker: Option<i32>` to `Segment` variant.

**In `transcribe()`** (`cmd/mod.rs`): pass speaker from event into `Segment` type.

**Files:**
- `/Users/yqbqwlny/Documents/audio/vibe/desktop/src-tauri/src/cmd/mod.rs`
- `/Users/yqbqwlny/Documents/audio/vibe/desktop/src-tauri/src/sona.rs`
- `/Users/yqbqwlny/Documents/audio/vibe/desktop/src-tauri/src/types.rs` (add `speaker` to `Segment`)

## 4. Frontend — Config constants

Add to `config.ts`:
```typescript
export const diarizeModelFilename = 'diar_streaming_sortformer_4spk-v2.1.onnx'
export const diarizeModelUrl = 'https://huggingface.co/altunenes/parakeet-rs/resolve/main/diar_streaming_sortformer_4spk-v2.1.onnx'
```

**File:** `/Users/yqbqwlny/Documents/audio/vibe/desktop/src/lib/config.ts`

## 5. Frontend — Preference state

Add to `Preference` interface and provider:
```typescript
diarizeEnabled: boolean
setDiarizeEnabled: ModifyState<boolean>
```

Store in localStorage as `prefs_diarize_enabled`, default `false`.

**File:** `/Users/yqbqwlny/Documents/audio/vibe/desktop/src/providers/Preference.tsx`

## 6. Frontend — More Options UI (Params.tsx)

Add a new **Diarization** section between FFmpeg Options and Presets:

```
── Diarization ──
[Switch] Enable speaker diarization
```

When toggling ON:
1. Check if diarize model exists in models folder (`get_models_folder` + `diarizeModelFilename`)
2. If not: show dialog asking to download (~25MB), if yes → navigate to download flow or download inline with progress
3. If yes: enable the switch

The switch state is `preference.diarizeEnabled`.

**File:** `/Users/yqbqwlny/Documents/audio/vibe/desktop/src/components/Params.tsx`

## 7. Frontend — Pass `diarize_model` in transcription

In `viewModel.ts` (home and batch), when building `TranscribeOptions`:
- If `preference.diarizeEnabled`, set `diarize_model` to `{models_folder}/{diarizeModelFilename}`
- Otherwise omit it

**Files:**
- `/Users/yqbqwlny/Documents/audio/vibe/desktop/src/pages/home/viewModel.ts`
- `/Users/yqbqwlny/Documents/audio/vibe/desktop/src/pages/batch/viewModel.tsx`

## 8. Frontend — Display speaker in segments

Update segment rendering to show speaker label when present.

**Files:** Segment display components (wherever segments are rendered in the UI).

## Verification

1. `uv run scripts/pre_build.py` — should download both `sona` and `sona-diarize` to `desktop/src-tauri/binaries/`
2. `pnpm exec tauri dev` — app builds and runs
3. More Options → Diarization → enable toggle → prompts to download model → downloads
4. Transcribe audio → segments show speaker labels
5. Disable diarization → transcribe without speaker labels (normal behavior)
6. If `sona-diarize` binary missing → diarization silently skipped, transcription works normally
