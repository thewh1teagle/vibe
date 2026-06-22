# Mac support — research and plan

Status: **not started**. Drafted after the v1.2.0 release as future work.

## Why we don't have it yet

- The project is Windows-only by design (see `AGENTS.md`).
- macOS distribution outside the App Store requires **Apple Developer Program** at **$99/year** for code signing and notarization. Without it, users get a "from an unidentified developer" warning and must right-click → Open.
- The original project, [thewh1teagle/vibe](https://github.com/thewh1teagle/vibe), ships a signed `aarch64.dmg` and has had macOS code signing since v3.0.13. They have an Apple Developer account.

## What's already cross-platform

These pieces need no work to support macOS:

- **Groq integration** (`desktop/src-tauri/src/groq.rs`, `cleanup.rs`) — pure HTTP, no platform code.
- **`enigo`** — already a cross-platform keyboard/mouse library, supports macOS.
- **`scripts/pre_build.py`** — `SONA_ASSET_MAP` already has both `aarch64-apple-darwin` and `x86_64-apple-darwin` entries.
- **Core transcription flow** — Tauri commands are platform-agnostic.

## What's Windows-specific and needs work

| File | What needs to change |
| --- | --- |
| `desktop/src-tauri/src/tray.rs` | Replace Windows tray API with `NSStatusItem`. Tray icons on macOS look and behave differently. |
| `desktop/src-tauri/src/main.rs` | `windows_subsystem = "windows"` is a no-op on non-Windows, but the surrounding code may need cleanup. |
| Global shortcut permission | macOS requires the user to grant Accessibility permission in System Settings. The app must detect this and prompt the user. |
| Microphone permission | macOS requires microphone permission on first use. Tauri's `tauri-plugin-os` doesn't handle this — needs an `Info.plist` entry. |
| `AGENTS.md` | Update "Target: Windows only" → "Windows + macOS". |

## CI changes (`.github/workflows/release.yml`)

- Add a `macos-latest` job to the release matrix.
- Build for both `aarch64-apple-darwin` and `x86_64-apple-darwin`.
- Package as `.dmg` (use `tauri-apps/tauri-action` with `tauri.bundle.targets: ["dmg"]`).
- macOS runners are ~10× more expensive than Linux. Budget accordingly.

## Distribution options

### With Apple Developer Program ($99/year)

- Code signing via `codesign` + Developer ID certificate.
- Notarization via `notarytool` + App Store Connect API key.
- Users get a clean "Open" experience.
- Required for any non-trivial public distribution.

### Without (cheapest path)

- Build unsigned `.app` and `.dmg` locally.
- Distribute via GitHub Releases or a Homebrew tap.
- Users see the "unidentified developer" warning and must right-click → Open the first time.
- Acceptable for early adopters and a small inner circle (e.g. the dyslexic users mentioned in the v1.2.0 release).
- macOS allows this indefinitely for self-built apps — Apple just makes it inconvenient.

### Homebrew tap (middle ground)

- Distribute via `brew install mikkelka/vibe-simplify/vibe`.
- Homebrew handles the "right-click → Open" warning gracefully.
- More discoverable than GitHub Releases alone.

## Recommended order if we do this

1. **Local build verification** — try building on a Mac (friend's machine, MacStadium, etc.) to surface compile errors. Most code will work; the tray is the main risk.
2. **Tray rewrite** — `NSStatusItem` from the `tauri` tray plugin or a direct `objc`/`cocoa` binding.
3. **Permission UX** — detect missing Accessibility/Microphone permission, show a helpful dialog with a link to System Settings.
4. **CI matrix** — add `macos-latest` to `.github/workflows/release.yml`.
5. **DMG packaging** — configure `tauri.bundle.targets` in `tauri.conf.json`.
6. **Code signing + notarization** — last step, only if we want a polished experience. Otherwise skip and document the warning.

## Reference points in the original project

- [v3.0.13 release notes](https://github.com/thewh1teagle/vibe/releases/tag/v3.0.13) — "🍎 macOS app is now code-signed"
- [v3.0.14 release notes](https://github.com/thewh1teagle/vibe/releases/tag/v3.0.14) — "🧹 Cleanup of unused macOS signing configuration"
- [v3.0.16 release notes](https://github.com/thewh1teagle/vibe/releases/tag/v3.0.16) — "🍏 Fix macOS system audio recording"

These show that the original project dealt with the same issues, particularly around macOS system audio recording. The `cpal` fork mentioned in our `AGENTS.md` is a related issue.

## Estimated effort

Rough ballpark for a working unsigned build: **1–2 weeks** of focused work, mostly in `tray.rs` and CI configuration. Adding code signing + notarization doubles that, plus ongoing yearly cost and CI complexity.
