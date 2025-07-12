# Building

### Prerequisites

[Bun](https://bun.sh/) | [Cargo](https://www.rust-lang.org/tools/install) | [Clang](https://releases.llvm.org/download.html) | [Cmake](https://cmake.org/download/)

**Windows**:

**Note** Install Clang into `C:\Program Files\LLVM` or set `LIBCLANG_PATH` env.

`Winget` packages

```console
winget install -e --id JernejSimoncic.Wget
winget install -e --id 7zip.7zip
```

**Linux**:

Based on [tauri/prerequisites/#setting-up-linux](https://tauri.app/v1/guides/getting-started/prerequisites/#setting-up-linux)

```console
sudo apt-get update
sudo apt-get install -y ffmpeg libopenblas-dev # runtime
sudo apt-get install -y pkg-config build-essential libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev clang cmake libssl-dev # tauri
sudo apt-get install -y libavutil-dev libavformat-dev libavfilter-dev libavdevice-dev # ffmpeg
```

_Vulkan (Linux)_

```console
sudo apt-get install -y mesa-vulkan-drivers
```

_Vulkan (Windows)_

**Run as admin once!!!**

```console
bun run scripts\pre_build.js --vulkan
```

## Build

Install dependencies from `desktop` folder

```console
bun install
```

Execute pre build scripts and follow the instructions it provide

```console
bun scripts/pre_build.js
```

## Build with `Nvidia` support

See [whisper.cpp#nvidia-support](https://github.com/ggerganov/whisper.cpp?tab=readme-ov-file#nvidia-gpu-support)

1. Enable `cuda` feature in `Cargo.toml`

2. Install [`cuda`](https://developer.nvidia.com/cuda-downloads)

3. Add to `tauri.windows.conf.json`

<details>

<summary>tauri.windows.conf.json</summary>

```json
{
	"bundle": {
		"resources": {
			"ffmpeg\\bin\\x64\\*.dll": "./",
			"openblas\\bin\\*.dll": "./",
			"C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.5\\bin\\cudart64_*": "./",
			"C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.5\\bin\\cublas64_*": "./",
			"C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.5\\bin\\cublasLt64_*": "./"
		}
	}
}
```

</details>

4. Build in `Powershell`

```console
$env:CUDA_PATH = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.5"
$env:CudaToolkitDir = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.5"
bun run scripts/pre_build.js --openblas --build
```

## Build with `AMD` support

AMD support is only available under linux environment

1. Install [`rocm toolkit`](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/)

2. Run `bun scripts/pre_build.js --amd`

3. Run

```console
export ROCM_VERSION="your rocm version"
cd desktop
bunx tauri build
```

## Gotchas

### On Linux cmake not find Vulkan

Then install it from [here](https://vulkan.lunarg.com/sdk/home)

On Windows when run `pre_build` with `--vulkan` you may need to run it with admin rights first time thanks to vulkan recent changes...

On Ubuntu you may need to copy some libraries for `ffmpeg_next` library

```console
sudo cp -rf /usr/include/x86_64-linux-gnu/libsw* /usr/include/
sudo cp -rf /usr/include/x86_64-linux-gnu/libav* /usr/include/
```

If the CPU failed to execute an instruction, then build with the following environment variable

```console
WHISPER_NO_AVX = "ON"
WHISPER_NO_AVX2 = "ON"
WHISPER_NO_FMA = "ON"
WHISPER_NO_F16C = "ON"
```

Rust analyzer failed to run on windows

1. Execute `cargo clean`
2. Add to `settings.json`:

```json
"rust-analyzer.cargo.extraEnv": {
	"FFMPEG_DIR": "${workspaceFolder}\\desktop\\src-tauri\\ffmpeg",
	"OPENBLAS_PATH": "${workspaceFolder}\\desktop\\src-tauri\\openblas",
	"LIBCLANG_PATH": "C:\\Program Files\\LLVM\\bin"
}
```

3. Relaunch `VSCode`

Otherwise you will get error such as `ggml_gallocr_needs_realloc: graph has different number of nodes` and it will transcribe slower.

## Test

```
export RUST_LOG=trace
cargo test -- --nocapture
```

## Test core in release mode

```console
cargo test -p vibe_core --release -- --nocapture
```

# Lint

```console
cargo fmt
cargo clippy
```

# Create new release

1. Increment version in `tauri.conf.json` and commit
2. Create new git tag and push

```console
git tag -a v<version> -m "v<version>" && git push --tags
```

It will create releases for `Windows`, `Linux`, and `macOS`

Along with `latest.json` file (used for auto updater).

When `Release` action finish, it will run `Deploy landing` action

and update downloads links in landing page.

# Landing

## Compress images

```console
bunx tinypng-go static/*.png
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

## Merge dev branch

```console
gh pr create # Enter defaults
# After merge reset dev
git checkout dev
git reset --hard main
git push origin dev --force
```

## Update packages

```console
bun i -D
bunx ncu -u
cd src-tauri
cargo install cargo-edit
rm -rf ../Cargo.lock
CARGO_NET_GIT_FETCH_WITH_CLI=true
CARGO_NET_GIT_FETCH_WITH_CLI=true cargo upgrade
# OR
cargo +nightly -Zunstable-options update --breaking
```

## Debug in release mode in VSCode

```json
{
	"rust-analyzer.runnables.extraEnv": {
		"FFMPEG_DIR": "${workspaceFolder}\\desktop\\src-tauri\\ffmpeg",
		"OPENBLAS_PATH": "${workspaceFolder}\\desktop\\src-tauri\\openblas",
		"LIBCLANG_PATH": "C:\\Program Files\\LLVM\\bin"
	},
	"rust-analyzer.runnables.extraArgs": ["--release"]
}
```

## Test core

```console
bun run scripts/pre_build.js
# Export env
$env:PATH += ";$pwd\desktop\src-tauri\openblas\bin"
cargo test --target x86_64-pc-windows-msvc --features "vulkan" -p vibe_core --release -- --nocapture
```

## Clear Github actions cache

```console
gh cache delete -a
```

## Notes

-   Always update crates and lock in specific commit so it will be easy to revert!!
-   Don't upgrade important crates such as tauri as long as it stable and works and there's no real need!!

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
