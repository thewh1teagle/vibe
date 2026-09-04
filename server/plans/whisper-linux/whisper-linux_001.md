# whisper.cpp Linux + Vulkan Integration

## Goal
Add Linux support to sona using whisper.cpp with Vulkan GPU acceleration.

## Setup

### Clone
```bash
git clone --recursive --depth 1 https://github.com/ggerganov/whisper.cpp.git
```

### Dependencies (Ubuntu/Debian)
```bash
sudo apt install libvulkan-dev vulkan-tools glslang-tools glslc libshaderc-dev
```
Note: `glslc` is a separate package from `libshaderc-dev` on Ubuntu — both are needed.

### Build
```bash
cmake -B whisper.cpp/build -S whisper.cpp -DGGML_VULKAN=ON -DCMAKE_BUILD_TYPE=Release
cmake --build whisper.cpp/build -j$(nproc)
```

## Status
- [x] Cloned whisper.cpp (shallow + recursive)
- [x] Install Vulkan deps
- [x] Build with Vulkan (aarch64, CPU + Vulkan backends)
- [x] Integrate into sona (Go CGo bindings compile)
- [x] Test inference — Vulkan on NVIDIA GB10, jfk.wav transcribed correctly

## Build Details

### Static libs (in `third_party/lib/`)
`libwhisper.a`, `libggml.a`, `libggml-base.a`, `libggml-cpu.a`, `libggml-vulkan.a`

### CGo link flags (whisper_linux.go)
```
-lwhisper -lggml -lggml-base -lggml-cpu -lggml-vulkan
-lvulkan -lstdc++ -lm -lpthread -lgomp
```

### Rebuild static libs
```bash
cmake -B whisper.cpp/build -S whisper.cpp -DGGML_VULKAN=ON -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF
cmake --build whisper.cpp/build -j$(nproc)
```
