# Building

### Prerequisites

[pnpm](https://pnpm.io/) | [uv](https://docs.astral.sh/uv/) | [Cargo](https://www.rust-lang.org/tools/install)

**Linux**:

Based on [tauri/prerequisites/#setting-up-linux](https://tauri.app/v1/guides/getting-started/prerequisites/#setting-up-linux)

```console
sudo apt-get update
sudo apt-get install -y pkg-config build-essential libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev clang cmake libssl-dev libasound2-dev
```

**macOS**:

Make sure to install XCode from the AppStore and open it once so it will download essential macOS libraries.

## Build

Run the pre-build script (downloads the sona sidecar binary and sets up platform deps):

```console
uv run scripts/pre_build.py
```

Install frontend dependencies from `desktop` folder:

```console
cd desktop
pnpm install
```

Start dev mode:

```console
pnpm exec tauri dev
```

Or build for production:

```console
pnpm exec tauri build
```

You can also do it all in one step:

```console
uv run scripts/pre_build.py --dev   # or --build
```

## Test

```console
export RUST_LOG=trace
cargo test -- --nocapture
```

# Lint

```console
cargo fmt
cargo clippy
```

# Create new release

1. Increment version in `tauri.conf.json` and commit
2. Run the Release workflow from GitHub Actions (workflow_dispatch)

It will create releases for `Windows`, `Linux`, and `macOS`

Along with `latest.json` file (used for auto updater).

When `Release` action finishes, it will run `Deploy landing` action

and update downloads links in landing page.

# Landing

## Compress images

```console
pnpx tinypng-go static/*.png
```

## Convert markdown to PDF

```console
go install github.com/mandolyte/mdtopdf/cmd/md2pdf@latest
md2pdf -i landing/static/privacy_policy.md -o landing/static/privacy_policy.pdf
```

## Normalize wav file for tests

```console
ffmpeg -i file.wav -ar 16000 -ac 1 -c:a pcm_s16le normal.wav
```

## Edit PR before merge

1. Install [gh cli](https://cli.github.com/)

```console
gh pr checkout <url>
git push <fork url>
```

## Update packages

```console
pnpm install
pnpx ncu -u
cd src-tauri
cargo install cargo-edit
rm -rf ../Cargo.lock
CARGO_NET_GIT_FETCH_WITH_CLI=true cargo upgrade
# OR
cargo +nightly -Zunstable-options update --breaking
```

## Clear Github actions cache

```console
gh cache delete -a
```

## Notes

- Always update crates and lock in specific commit so it will be easy to revert!!
- Don't upgrade important crates such as tauri as long as it stable and works and there's no real need!!

## Sign on Windows

See [Self sign tauri on Windows](https://gist.github.com/thewh1teagle/06022cf1ec17a62949377a17c1b590bd)

## Build faster in dev mode (useful in Windows)

```console
rustup nightly install
rustup component add rustc-codegen-cranelift-preview --toolchain nightly
# Unix
CARGO_PROFILE_DEV_CODEGEN_BACKEND="cranelift" cargo +nightly build -Zcodegen-backend
# Powershell
$env:CARGO_PROFILE_DEV_CODEGEN_BACKEND="cranelift" ; cargo +nightly build -Zcodegen-backend
```
