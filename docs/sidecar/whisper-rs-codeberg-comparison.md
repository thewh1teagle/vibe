# Codeberg whisper-rs comparison

Reference clone:

```text
third_party/whisper-rs-codeberg
```

Compared against our crates:

- `crates/whisper-rs-sys`
- `crates/whisper-rs`

## Adopted

- Suppress whisper.cpp and third-party warning noise in CMake with `WHISPER_ALL_WARNINGS=OFF` and `WHISPER_ALL_WARNINGS_3RD_PARTY=OFF`.
- Build whisper.cpp with CMake `Release` profile even when the Rust crate is checked in debug mode. Debug whisper.cpp builds are too slow for practical local validation.
- Disable `GGML_OPENMP` explicitly so builds do not accidentally depend on OpenMP runtime availability.
- Enable `GGML_METAL_NDEBUG` with Metal to reduce Metal backend debug overhead and log noise.
- Pass through explicit `WHISPER_*`, `GGML_*`, and `CMAKE_*` environment overrides to CMake for advanced build debugging.
- Add Windows Vulkan SDK link-path handling and link `vulkan-1`.
- Add Windows `advapi32` system library link.
- Generate bindings for `ggml_log_set` and `ggml_log_level`.
- Install a native log sink in `whisper-rs` that discards whisper.cpp and ggml logs by default, keeping sidecar stdout/stderr clean.

## Not Adopted

- CUDA, HIP, OpenBLAS, CoreML, OpenMP, and SYCL features. The sidecar target is Metal on macOS and Vulkan on Linux/Windows.
- Bundled fallback bindings. Our sys crate downloads and builds a pinned whisper.cpp tag, so generated bindings are preferred for now.
- Full upstream wrapper surface such as grammar, token iteration, VAD wrappers, and tracing/log crate backends. The sidecar currently needs model loading, transcription, progress/segment callbacks, and quiet logs.

