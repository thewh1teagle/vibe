# Building Sona

## Architecture

The C library (whisper.cpp) and the Sona binary are built separately:

1. **`.whispercpp-commit`** is the single source of truth for the whisper.cpp version. All scripts read from it.
2. **`cargo xtask build-libs`** clones whisper.cpp at that commit, builds static `.a` files, and uploads them to a GitHub release tagged `libraries-{commit[:7]}`.
3. **`cargo xtask fetch-libs`** downloads the prebuilt `.a` files for the current platform from that release into `third_party/lib/`.
4. **`cargo xtask fetch-headers`** fetches the C headers into `third_party/include/` (these are checked into git).
5. The binary links against `third_party/include/` and `third_party/lib/`.

This separation means contributors never need to build whisper.cpp locally -- they just run the download script.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)

## Quick start

```bash
cargo xtask fetch-headers
cargo xtask fetch-libs
cargo build -p sona --release
```

On Windows, MinGW is needed for the prebuilt whisper.cpp/Vulkan libraries:

```bash
C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -use-full-path
pacman -Sy --needed mingw-w64-x86_64-gcc mingw-w64-x86_64-vulkan-devel mingw-w64-x86_64-cmake mingw-w64-x86_64-shaderc
cargo build -p sona --release
```

## Bumping whisper.cpp

1. Update the commit hash in `.whispercpp-commit`
2. Run `cargo xtask fetch-headers` and commit the updated headers
3. Trigger the `Build whisper.cpp libs` workflow (or run `cargo xtask build-libs --upload` locally)

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
