# Plan: Auto-update yt-dlp from GitHub releases

## Problem

yt-dlp version is hardcoded in `config.ts` as `2025.01.150` (typo — actual release tag is `2025.01.15`). Users are stuck on this old version until a developer manually bumps the string. The latest release is `2026.02.04`.

The current update flow:
1. `config.ts` has `ytDlpVersion` and `ytDlpConfig` with hardcoded URLs per platform
2. `viewModel.ts` compares `config.ytDlpVersion` with `preference.ytDlpVersion` (localStorage)
3. If mismatch → prompt user to update → downloads from hardcoded URL → saves new version to localStorage
4. Binary stored in `appLocalDataDir` as `yt-dlp.exe` / `yt-dlp_linux` / `yt-dlp_macos`

**Problems:**
- Version never updates unless someone edits `config.ts` and ships a new app release
- Typo in version string (`2025.01.150` vs `2025.01.15`) — doesn't break anything but is sloppy
- No way for users to get newer yt-dlp without a Vibe app update

## Solution: Fetch latest version from GitHub API at runtime

Instead of hardcoding a version, query the GitHub releases API to discover the latest yt-dlp version dynamically. This way users always get the latest yt-dlp without waiting for a Vibe app update.

---

## Change 1: New `ytdlp.rs` command — `get_latest_ytdlp_version`

Add a Tauri command that fetches the latest release tag from GitHub API.

**File:** `desktop/src-tauri/src/cmd/ytdlp.rs`

```rust
#[tauri::command]
pub async fn get_latest_ytdlp_version() -> Result<String> {
    let client = reqwest::Client::builder()
        .user_agent("vibe-app")
        .build()?;
    let resp = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .send()
        .await?
        .error_for_status()?;
    let json: serde_json::Value = resp.json().await?;
    let tag = json["tag_name"]
        .as_str()
        .context("missing tag_name")?
        .to_string();
    Ok(tag)
}
```

Register in `main.rs` alongside the existing yt-dlp commands.

**Dependency:** Add `reqwest` to `Cargo.toml` if not already present (check — Tauri may already bundle it via the updater plugin or download commands).

---

## Change 2: Simplify `config.ts` — remove hardcoded version and URLs

**File:** `desktop/src/lib/config.ts`

Remove `ytDlpVersion` and `ytDlpConfig` entirely. Replace with a helper that constructs URLs from a version tag:

```typescript
export const ytDlpAssetNames = {
  windows: 'yt-dlp.exe',
  linux: 'yt-dlp_linux',
  macos: 'yt-dlp_macos',
} as const

export function ytDlpDownloadUrl(version: string, platform: keyof typeof ytDlpAssetNames): string {
  return `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${ytDlpAssetNames[platform]}`
}
```

Asset names have been stable across releases (`yt-dlp.exe`, `yt-dlp_linux`, `yt-dlp_macos`). Only the version in the URL path changes.

---

## Change 3: Update `ytdlp.ts` — accept version parameter

**File:** `desktop/src/lib/ytdlp.ts`

```typescript
import { platform } from '@tauri-apps/plugin-os'
import { ytDlpAssetNames, ytDlpDownloadUrl } from './config'
import * as fs from '@tauri-apps/plugin-fs'
import * as path from '@tauri-apps/api/path'
import { invoke } from '@tauri-apps/api/core'

const platformName = platform()
const assetName = ytDlpAssetNames[platformName as keyof typeof ytDlpAssetNames]

async function getBinaryPath() {
  const localDataPath = await path.appLocalDataDir()
  return await path.join(localDataPath, assetName)
}

export async function exists() {
  const binaryPath = await getBinaryPath()
  return await fs.exists(binaryPath)
}

export async function getLatestVersion(): Promise<string> {
  return await invoke<string>('get_latest_ytdlp_version')
}

export async function downloadYtDlp(version: string) {
  const url = ytDlpDownloadUrl(version, platformName as keyof typeof ytDlpAssetNames)
  const binaryPath = await getBinaryPath()
  await invoke('download_file', { url, path: binaryPath })
}

export async function downloadAudio(url: string, inDocuments?: boolean) {
  const outPath = await invoke<string>('get_temp_path', { ext: 'm4a', inDocuments })
  await invoke<string>('download_audio', { url, outPath })
  return outPath
}
```

Key changes:
- `downloadYtDlp()` now takes a `version` parameter
- New `getLatestVersion()` calls the Rust command
- Uses `ytDlpAssetNames` / `ytDlpDownloadUrl` from config

---

## Change 4: Update `viewModel.ts` — fetch latest version dynamically

**File:** `desktop/src/pages/home/viewModel.ts`

The `switchToLinkTab()` function currently does:
```typescript
const isUpToDate = config.ytDlpVersion === preference.ytDlpVersion
```

Replace with:
```typescript
async function switchToLinkTab() {
  if (switchingToLinkRef.current) return
  switchingToLinkRef.current = true

  try {
    const binaryExists = await ytDlp.exists()

    // Fetch latest version (with fallback to skip update check on network error)
    let latestVersion: string | null = null
    try {
      latestVersion = await ytDlp.getLatestVersion()
    } catch {
      // Network error — skip version check, just use existing binary if present
      if (binaryExists) {
        preference.setHomeTabIndex(2)
        return
      }
    }

    const isUpToDate = latestVersion !== null && latestVersion === preference.ytDlpVersion

    if (!binaryExists || (!isUpToDate && preference.shouldCheckYtDlpVersion)) {
      // ... same prompt logic as before ...

      if (shouldInstallOrUpdate) {
        const versionToDownload = latestVersion ?? preference.ytDlpVersion ?? '2026.02.04'
        toast.setMessage(t('common.downloading-ytdlp'))
        toast.setProgress(0)
        toast.setOpen(true)
        await ytDlp.downloadYtDlp(versionToDownload)
        preference.setYtDlpVersion(versionToDownload)
        // ...
      }
    }
    // ...
  }
}
```

Key behavior:
- Fetches latest version tag from GitHub API each time user switches to Link tab
- Compares with localStorage `ytDlpVersion` — if different, prompts update
- On network error, falls back gracefully (uses existing binary if present, or hardcoded fallback)
- Stores the downloaded version tag in localStorage after successful download

---

## Change 5: Remove `ytDlpVersion` from config.ts exports

Delete these lines from `config.ts`:
```typescript
export const ytDlpVersion = '2025.01.150'
export const ytDlpConfig = { ... }
```

Any other references to `config.ytDlpVersion` or `config.ytDlpConfig` must be updated. Grep shows only `viewModel.ts` uses them.

---

## Summary

| File | Change |
|-|-|
| `src-tauri/src/cmd/ytdlp.rs` | Add `get_latest_ytdlp_version` command (GitHub API fetch) |
| `src-tauri/src/main.rs` | Register the new command |
| `src-tauri/Cargo.toml` | Add `reqwest` if not already present |
| `src/lib/config.ts` | Remove `ytDlpVersion` + `ytDlpConfig`, add `ytDlpAssetNames` + `ytDlpDownloadUrl()` |
| `src/lib/ytdlp.ts` | Add `getLatestVersion()`, make `downloadYtDlp()` accept version param |
| `src/pages/home/viewModel.ts` | Fetch latest version dynamically instead of comparing hardcoded string |

## Edge cases

- **Rate limiting:** GitHub API allows 60 req/hour unauthenticated. This is called once per tab switch, so unlikely to hit limits. If it becomes an issue, cache the result for 1 hour in localStorage.
- **Network offline:** Gracefully falls back — if binary exists, let user proceed. If binary doesn't exist and can't fetch version, show error.
- **Old localStorage version format:** Current `preference.ytDlpVersion` stores the hardcoded string (`2025.01.150`). After this change, it will store real GitHub tags (`2026.02.04`). The mismatch with the old value will naturally trigger a one-time update prompt, which is correct behavior.
