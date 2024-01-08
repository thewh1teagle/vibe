# ruscribe

# test
```
export RUST_LOG=trace
cargo test -- --nocapture
```

```console
ffmpeg -i 1.opus -ar 16000 1.wav
cargo run -- --path 1.wav --output out.txt --n-threads 10
```

```console
rustup override set stable-x86_64-pc-windows-gnu
```
