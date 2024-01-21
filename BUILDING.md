# Building

## Windows

install msys2 and open ucrt64 terminal

```console
pacman --needed -S $MINGW_PACKAGE_PREFIX-{ffmpeg,clang,rust} git
git clone https://github.com/thewh1teagle/ruscribe
cd ruscribe
rustup override set stable-x86_64-pc-windows-gnu # if not already
cargo build --release
```

With OpenBlas

```
pacman --needed -S $MINGW_PACKAGE_PREFIX-openblas
OPENBLAS_PATH=$MINGW_PREFIX PATH="/c/Program Files/nodejs:$PATH" cargo tauri build
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
```console
sudo apt-get update
sudo apt-get install -y libblas-dev liblapack-dev libavutil-dev
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
