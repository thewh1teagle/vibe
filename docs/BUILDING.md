# Building Sona

## Architecture

The C library (ggml) and the Sona binary are built separately:

1. **`.ggml-version`** is the single source of truth for the ggml release tag. Every task reads it.
2. **`chore build-libs`** clones ggml at that tag, builds the static libraries for the current platform, and packages them; **`chore upload-libs`** does that and uploads the archive to the GitHub release tagged `libraries-ggml-{tag}`.
3. **`chore fetch-libs`** downloads the prebuilt static libraries for the current platform from that release into `third_party/lib/`.
4. **`chore fetch-headers`** fetches the C headers into `third_party/include/` (these are checked into git).
5. The binary links against `third_party/include/` and `third_party/lib/`.

This separation means contributors never need to build ggml locally; they just fetch the libraries.

Tasks live in the `chorefile` at the repository root. `chore list` shows them all.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [chore](https://github.com/getchore/chore)

## Quick start

```bash
chore fetch-headers
chore fetch-libs
cargo build -p sona --release
```

On Windows, the Sona binary uses Rust's default MSVC target. Install the Vulkan SDK before building locally:

```bash
choco install vulkan-sdk -y
cargo build -p sona --release
```

The library workflow also builds a `windows-amd64-gnu` ggml bundle for compatibility (`SONA_WINDOWS_LIB_FLAVOR=gnu`), but release binaries use `windows-amd64-msvc`.

### Two CPU backends on x86_64

AVX2 is compiled into every ggml CPU kernel, so one build cannot serve a CPU without it. On x86_64 the bundle carries the CPU backend twice, `ggml-cpu-hsw` (AVX2, FMA, BMI2) and `ggml-cpu-x64` (AVX baseline), with every symbol suffixed so both link into the one binary. `ggml-rs-sys` defines `ggml_backend_cpu_reg` in Rust and forwards to the build the CPU can run. The suffixing needs `nm` and `objcopy` (`llvm-nm` and `llvm-objcopy` for MSVC), which `chore build-libs` runs; `chore fetch-libs` users need nothing extra.

### Patches

`patches/ggml/` holds fixes ggml has not taken yet; `chore build-libs` applies them after the checkout. Each patch starts with a note saying what it is for and where upstream stands. When a bumped tag already carries a fix, `git apply` fails the build: delete the patch and the apply line in the chorefile.

## Bumping ggml

1. Update the tag in `.ggml-version`
2. Run `chore fetch-headers` and commit the updated headers
3. Trigger the `Build GGML libs` workflow (or run `chore upload-libs` locally)

## Packaging a release archive

`chore package-release <binary> <darwin|windows> <amd64|arm64> <out.tar.gz|out.zip>` bundles a built `sona` binary with ffmpeg the way the release workflow does.

## Releasing binaries

`Release Sona` workflow builds and uploads Rust `sona` binaries for:
- Linux: `amd64`, `arm64`
- macOS: Apple Silicon and Intel
- Windows: `amd64`

It also injects the CLI version at build time via environment variables:

```bash
SONA_VERSION=<tag> SONA_COMMIT=<sha> cargo build -p sona --release
```

You can run releases in two ways:

1. Push a tag like `v0.1.0` (workflow trigger: `push tags: v*`)
2. Manual dispatch with input `version` (example: `v0.1.0`)
