# Building

## Windows

### Prerequisites

[NodeJS](https://nodejs.org/en/download/current) | [Cargo](https://www.rust-lang.org/tools/install) | [Clang](https://releases.llvm.org/download.html) | [7z](https://www.7-zip.org/download.html) | [Cmake](https://cmake.org/download/)

Node dependencies (from `desktop` directory)

```console
npm install
npm install -D
```

**Windows**: [Msys2](https://www.msys2.org/)

**MacOS** brew packages

```console
brew install openblas git lz4 libxml2 zlib bzip2 wget python@3.8
```

**Linux** packages

Based on [tauri/prerequisites/#setting-up-linux](https://tauri.app/v1/guides/getting-started/prerequisites/#setting-up-linux)

```console
sudo apt-get update
sudo apt-get install -y ffmpeg libopenblas-dev \ # runtime
    pkg-config build-essential libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev clang cmake \ # tauri
    libavutil-dev libavformat-dev libavfilter-dev libavdevice-dev # ffmpeg
```

## Build

Linux / MacOS

```console
./scripts/pre_build.sh
```

Windows

```console
C:\msys64\msys2_shell.cmd -defterm -use-full-path -no-start -ucrt64 -here -c "scripts/pre_build.sh"
```

## Test

```
export RUST_LOG=trace
cargo test -- --nocapture
```

## With Sample
```console
ffmpeg -i in.opus -ar 16000 out.wav
cargo run -- --path out.wav --output out.txt --n-threads 5
```
