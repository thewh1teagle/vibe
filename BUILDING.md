# Building

install msys2 and open ucrt64 terminal
```console
pacman --needed -S $MINGW_PACKAGE_PREFIX-{rust,ffmpeg} git
git clone https://github.com/thewh1teagle/ruscribe
cd ruscribe
rustup override set stable-x86_64-pc-windows-gnu # if not already
cargo build --release
```

## test
```
export RUST_LOG=trace
cargo test -- --nocapture
```

```console
ffmpeg -i 1.opus -ar 16000 1.wav
cargo run -- --path 1.wav --output out.txt --n-threads 10
```


