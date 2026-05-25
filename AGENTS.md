# AGENTS.md

## Architecture

Vibe is a **Tauri v2** desktop app (Rust backend + React/TypeScript frontend). It bundles a separate Go transcription engine called **sona** as a sidecar binary. The `website/` directory is a standalone React landing page deployed via GitHub Pages.

See `docs/architecture.md` and `docs/building.md` for details.

## Package Managers

- JavaScript/Node.js: **pnpm** only
    - Install: `pnpm install` (in `desktop/` or `website/`)
    - Run scripts: `pnpm <script>`
    - Execute packages: `pnpx <cmd>` or `pnpm exec <cmd>`
- Python: **uv**
    - Run scripts: `uv run scripts/<script>.py`
    - Add deps: `uv add --script scripts/<script>.py <packages> --bounds exact`
    - CI uses uv for `scripts/pre_build.py`

## Project Layout

```
desktop/              # Tauri desktop app
  src/                #   React frontend (TypeScript, Tailwind v4)
  src-tauri/          #   Rust backend + tauri config
    binaries/         #     sona/ffmpeg sidecar binaries (downloaded, gitignored)
    locales/          #     i18n translation files
    src/              #     Rust source
vibe-simplify/website/              # Landing page (React, GitHub Pages)
scripts/              # Python utility scripts (uv)
plans/                # Self-contained validation scripts (uv + .py + .md)
.skills/              # Custom skills for agents
```

## Build

### Prerequisite: download sona sidecar

**Must run before any Tauri dev or build.** Downloads the `sona` Go binary into `desktop/src-tauri/binaries/`. The version is pinned in `.sona-version`.

```bash
uv run scripts/pre_build.py
# Or with explicit target:
uv run scripts/pre_build.py --target x86_64-pc-windows-msvc
```

On Linux this script also installs required apt packages. For macOS, install XCode and open it once first.

### Dev (Tauri app)

```bash
cd desktop
pnpm install
pnpm exec tauri dev        # starts Vite dev server + Tauri window
```

Do NOT use `pnpm dev` in `desktop/` — that only starts Vite without the Rust backend.

### Dev (website only)

```bash
cd website
pnpm install
pnpm dev
```

### Build for production

```bash
uv run scripts/pre_build.py --build    # or manually: pnpm exec tauri build
```

## Commands

| What | Command | Where |
|------|---------|-------|
| Rust tests | `cargo test -- --nocapture` | root |
| Rust format | `cargo fmt` | root |
| Rust lint | `cargo clippy --all-targets -- -D warnings` | root |
| JS format | `pnpm run format` | root |
| JS format check | `pnpm run format:check` | root |
| TypeScript check | `pnpm run check-types` | root (checks both desktop + website) |
| desktop lint | `pnpm lint` | `desktop/` |

## Code Style

- **Indentation**: tabs, 4-width (`.editorconfig`, `.prettierrc.json`)
- **No semicolons** (Prettier: `"semi": false`), single quotes (`'`), LF line endings
- **Prettier print width**: 160
- **Rust max width**: 130 (`rustfmt.toml`), `cargo fmt` reorders imports
- **Tilde imports**: `~/foo` resolves to `./src/foo` in both `desktop/` and `website/`

## Testing & CI

- Only **Rust lint CI** (fmt + clippy) runs on PRs that touch `desktop/src-tauri/**`. No automated JS lint or typecheck in CI.
- **Release**: workflow_dispatch from GitHub Actions only. Version bump goes in `desktop/src-tauri/tauri.conf.json`.
- Run `pnpm run format:check` and `pnpm run check-types` **manually** before submitting PRs.

## Validation Scripts

For each plan, create self-contained validation scripts under `plans/<name>/`:

```
plans/<name>/<name>_001.py
plans/<name>/<name>_001.md
```

Each `.py` is a standalone `uv` script with inline dependencies:

```bash
uv run plans/<name>/<name>_001.py
```

## Skills

Custom skills are in `.skills/`.

## Gotchas

- **sona sidecar is required**: If `pre_build.py` wasn't run, the Tauri build fails or the app won't transcribe.
- **GLIBCXX/lib issues on Linux** come from the sona binary, not the Rust code.
- **Prettier ignores YAML** (`.yaml`, `.yml`) — do not format GitHub Actions workflows with Prettier.
- **Two separate `pnpm install` calls**: `desktop/` and `website/` each have their own `package.json` and `pnpm-lock.yaml`. There is no workspace-level pnpm install.
- **Rust `clippy` CI builds the desktop frontend first** (needs `pre_build.py` + `pnpm install` + `pnpm build` in `desktop/`).
