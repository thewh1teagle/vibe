# Building

install msys2 and open ucrt64 terminal
```console
pacman --needed -S $MINGW_PACKAGE_PREFIX-{ffmpeg,clang,rust} git 
git clone https://github.com/thewh1teagle/ruscribe
cd ruscribe
rustup override set stable-x86_64-pc-windows-gnu # if not already
cargo build --release
```

## Desktop
for building to desktop you must use msys2 environment along with NodeJS installed outside of the environemnt.
```
PATH="/c/Program Files/nodejs:$PATH" cargo tauri build
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


