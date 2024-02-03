# Building

## Windows

dependencies:
NodeJS
Cargo
Clang (LLVM)
npm @tauri-app/cli
python

install msys2 and open ucrt64 terminal

```console
pacman --needed -S $MINGW_PACKAGE_PREFIX-{ffmpeg,clang,rust} git
git clone https://github.com/thewh1teagle/vibe
cd vibe
rustup override set stable-x86_64-pc-windows-gnu # if not already
cargo build --release
```

With OpenBlas

```console
pacman -S --needed git $MINGW_PACKAGE_PREFIX-{rust,ffmpeg,clang,openblas,toolchain}
git clone https://github.com/thewh1teagle/vibe
cd vibe/desktop
rustup override set stable-x86_64-pc-windows-gnu


export PATH="/c/Program Files/nodejs:$PATH"
npm i -g @tauri-apps/cli
npm i
# here inject beforeBundleCommand to find dll and create tauri.windows.config.json
export C_INCLUDE_PATH=${OPENBLAS_PATH}/include/openblas
npx tauri build
# here upload it (from target/release/bundle/nsis/)
```

for building to desktop you must use msys2 environment along with NodeJS installed outside of the environemnt.

```
RUST_LOG=trace PATH="/c/Program Files/nodejs:$PATH" cargo tauri build # use dev for develop
```

## MacOS

1. Install brew packages

```console
brew install lapack ffmpeg openblas git node@18
```

2. Install [rust](https://www.rust-lang.org/tools/install)
3. Install `tauri-cli`

```console
cargo install tauri-cli
```

4. Inside `desktop` folder build the app

```console
cargo tauri build
```

## Linux

1. Install packages

[prerequisites/#setting-up-linux](https://tauri.app/v1/guides/getting-started/prerequisites/#setting-up-linux)

```console
sudo apt-get update
sudo apt-get install -y clang build-essential curl wget file libopenblas-base libopenblas-dev libwebkit2gtk-4.0-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libblas-dev liblapack-dev libavutil-dev libavformat-dev libavfilter-dev libavdevice-dev libgtk-3-dev libsoup2.4-dev
```

2. Install [rust](https://www.rust-lang.org/tools/install)
3. Install `tauri-cli`

```console
cargo install tauri-cli
```

4. Inside `desktop` folder build the app

```console
cargo tauri build
```

## Test

```
export RUST_LOG=trace
cargo test -- --nocapture
```

```console
ffmpeg -i in.opus -ar 16000 out.wav
cargo run -- --path out.wav --output out.txt --n-threads 5
```
