# Building

### Prerequisites

[pnpm](https://pnpm.io/) | [uv](https://docs.astral.sh/uv/) | [Cargo](https://www.rust-lang.org/tools/install)

Install [chore](https://getchore.github.io/chore/) to use the tasks in the root `chorefile` (run `chore list` to see them; it includes each area's `tasks.chorefile`):

```console
# macOS / Linux
curl -fsSL https://getchore.github.io/chore/install.sh | sh
# Windows
irm https://getchore.github.io/chore/install.ps1 | iex
```

**Linux**:

```console
chore linux-deps
```

That is the apt list from [tauri/prerequisites/#setting-up-linux](https://v2.tauri.app/start/prerequisites/#linux)
plus what Vibe adds — alsa, xdo and the appindicator bindings. The release
workflow runs the same task, so the packages CI has are the packages you get.

**macOS**:

Make sure to install XCode from the AppStore and open it once so it will download essential macOS libraries.

## Build

```console
chore dev      # fetch the sidecars, then run the app
chore build    # fetch the sidecars, then build for production
```

Both start with `chore setup`, which downloads the sidecars from the server
release pinned by `.server-version` into `desktop/src-tauri/binaries/`. The same steps by hand:

```console
chore setup
cd desktop
pnpm install
pnpm exec tauri dev    # or: pnpm exec tauri build
```

`chore setup` takes a target triple for cross-compiles — `chore setup
x86_64-pc-windows-msvc` — which is how the release workflow uses it. Without one
it fetches for this machine.

On macOS, `chore upgrade` builds the app, replaces `/Applications/vibe.app` and
relaunches it.

## Build the server locally (dev)

The engine lives in `server/` and ships as the `vibe-server` sidecar. To run the
app against a build of the tree instead of the pinned release:

```console
chore setup            # ffmpeg and the released server, once
chore server-build     # fetch the ggml libraries, build server/, stage it as the sidecar
```

`server-build` puts `vibe-server-<triple>` where `setup` put the release, so
`tauri dev` and `tauri build` pick it up unchanged. See `server/docs/BUILDING.md`
for the engine on its own.

## Test

```console
chore test     # frontend tests (vitest)
```

Rust tests:

```console
export RUST_LOG=trace
cargo test -- --nocapture
```

# Lint

```console
chore ci           # everything below, in one go
chore lint         # eslint, then cargo fmt and clippy with CI's flags
chore format       # prettier and cargo fmt, in place
chore check-types  # tsc over desktop and website
chore check-i18n   # translation coverage against en-US
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
md2pdf -i website/public/privacy_policy.md -o website/public/privacy_policy.pdf
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

## Windows Code Signing

See [Windows Code Signing](https://gist.github.com/thewh1teagle/06022cf1ec17a62949377a17c1b590bd)

Install Windows SDK:

```console
winget install -e --id Microsoft.WindowsSDK.10.0.26100
```

Generate a self-signed certificate (valid 10 years):

```console
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/CN=Vibe" -addext "extendedKeyUsage=codeSigning"
openssl pkcs12 -export -out cert.pfx -inkey key.pem -in cert.pem -password pass:YOUR_PASSWORD
base64 -i cert.pfx
```

Copy the base64 output and update GitHub secrets:

- `WINDOWS_CERTIFICATE` — the base64 output
- `WINDOWS_CERTIFICATE_PASSWORD` — the password used above

Then delete the local files:

```console
rm key.pem cert.pem cert.pfx
```

## Analytics (Optional)

Vibe uses [Aptabase](https://aptabase.com/) for analytics. Not required for development. To enable, set these env vars at build time:

```console
export APTABASE_APP_KEY="A-..."
export APTABASE_BASE_URL="https://..."
```

## Gotchas

## Build faster in dev mode (useful in Windows)

```console
rustup nightly install
rustup component add rustc-codegen-cranelift-preview --toolchain nightly
# Unix
CARGO_PROFILE_DEV_CODEGEN_BACKEND="cranelift" cargo +nightly build -Zcodegen-backend
# Powershell
$env:CARGO_PROFILE_DEV_CODEGEN_BACKEND="cranelift" ; cargo +nightly build -Zcodegen-backend
```
