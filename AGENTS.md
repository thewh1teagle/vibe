# AGENTS.md

## Architecture

Vibe is a **Tauri v2** desktop app (Rust backend + React/TypeScript frontend). It bundles a Go transcription engine called **sona** as a sidecar binary. The app provides global hotkey dictation: press hotkey, speak, Whisper transcribes, output to clipboard or type-at-cursor.

Target: **Windows only** (x86_64-pc-windows-msvc).

## Package Managers

- JavaScript/Node.js: **pnpm** only
    - Install: `pnpm install` (in `desktop/`)
    - Run scripts: `pnpm <script>`
    - Execute packages: `pnpm exec <cmd>`
- Python: **uv**
    - Run scripts: `uv run scripts/pre_build.py`

## Project Layout

```
desktop/              # Tauri desktop app
  src/                #   React frontend (TypeScript, Tailwind v4)
  src-tauri/          #   Rust backend
    binaries/         #     sona/ffmpeg sidecar (downloaded, gitignored)
    locales/          #     en-US i18n only
    src/              #     Rust source
    icons/            #     App icons
scripts/              # pre_build.py (downloads sona sidecar)
```

## Build

### Prerequisite: download sona sidecar

**Must run before any Tauri dev or build.**

```bash
uv run scripts/pre_build.py --target x86_64-pc-windows-msvc
```

### Dev

```bash
cd desktop
pnpm install
pnpm exec tauri dev        # Vite dev server + Tauri window
```

Do NOT use `pnpm dev` — that only starts Vite without the Rust backend.

### Build for production

```bash
cd desktop
pnpm exec tauri build
```

## Commands

| What             | Command                                     | Where               |
| ---------------- | ------------------------------------------- | ------------------- |
| Rust tests       | `cargo test -- --nocapture`                 | root                |
| Rust format      | `cargo fmt`                                 | root                |
| Rust lint        | `cargo clippy --all-targets -- -D warnings` | root                |
| JS format        | `pnpm run format`                           | root                |
| JS format check  | `pnpm run format:check`                     | root                |
| TypeScript check | `pnpm run check-types`                      | root (desktop only) |
| desktop lint     | `pnpm lint`                                 | `desktop/`          |

## Code Style

- **Indentation**: tabs, 4-width (`.editorconfig`, `.prettierrc.json`)
- **No semicolons** (Prettier: `"semi": false`), single quotes (`'`), LF line endings
- **Prettier print width**: 160
- **Rust max width**: 130 (`rustfmt.toml`), `cargo fmt` reorders imports
- **Tilde imports**: `~/foo` resolves to `./src/foo` in `desktop/`

## CI

- Only **Rust lint CI** (fmt + clippy) runs on PRs that touch `desktop/src-tauri/**`.
- No automated JS lint or typecheck in CI — run `pnpm run format:check` and `pnpm run check-types` manually.

## Release

Releases happen via GitHub Actions when you push a git tag. Does **not** run on every commit.

### How to release

1. Update version in `desktop/src-tauri/tauri.conf.json` and `desktop/src-tauri/Cargo.toml`
2. Commit: `git commit -am "v1.0.1: describe changes"`
3. Tag and push:
    ```bash
    git tag v1.0.1
    git push origin main --tags
    ```
4. GitHub Actions builds EXE + NSIS installer automatically
5. A **draft release** appears on GitHub → go to Releases → edit and press "Publish"

### Manual trigger

Go to Actions → Release → "Run workflow" button. Builds without creating a release.

### Workflow file

`.github/workflows/release.yml` — uses `tauri-apps/tauri-action` on `windows-latest`.

## Gotchas

- **sona sidecar is required**: If `pre_build.py` wasn't run, the Tauri build fails or the app won't transcribe.
- **cpal fork**: Replaced private `thewh1teagle/cpal` with upstream `cpal = "0.17"`. macOS loopback not available but Windows is unaffected.
- **Prettier ignores YAML** (`.yaml`, `.yml`) — do not format CI workflows.
- **Rust `clippy` CI builds the desktop frontend first** (needs `pre_build.py` + `pnpm install` + `pnpm build` in `desktop/`).
