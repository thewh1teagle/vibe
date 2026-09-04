# Sona — Cross-Platform Whisper.cpp Linking Plan

## Goal

Build a Go HTTP transcription server that links whisper.cpp with GPU acceleration per platform, using prebuilt static libraries fetched from GitHub Releases.

## Platform Matrix

| Platform | GPU Backend | whisper/ggml libs | GPU runtime lib | Static? |
|----------|-------------|-------------------|-----------------|---------|
| macOS | Metal | `libwhisper.a libggml.a libggml-base.a libggml-cpu.a libggml-metal.a libggml-blas.a` | Apple frameworks (Metal, Foundation, Accelerate, CoreGraphics) | Libs: static. Frameworks: dynamic (system-provided, always present) |
| Linux | Vulkan | `libwhisper.a libggml.a libggml-base.a libggml-cpu.a libggml-vulkan.a` | `libvulkan.so` | Libs: static. Vulkan loader: dynamic (must be installed by user) |
| Windows | Vulkan | `whisper.lib ggml.lib ggml-base.lib ggml-cpu.lib ggml-vulkan.lib` | `vulkan-1.dll` | Libs: static. Vulkan loader: dynamic (must be installed by user) |

## Why Vulkan loader must be dynamic

The Vulkan loader (`libvulkan.so` / `vulkan-1.dll`) dispatches to vendor ICDs (Installable Client Drivers) at runtime. Static linking is officially discouraged by Khronos — it causes conflicts when Vulkan objects cross component boundaries. This is the same model every Vulkan app uses. Users get it with their GPU drivers.

## Project Structure

```
sona/
├── cmd/sona/
│   └── main.go                  # entry point
├── internal/
│   ├── whisper/
│   │   ├── whisper.go           # common Go API (no CGo)
│   │   ├── whisper_darwin.go    # //go:build darwin — Metal CGo directives
│   │   ├── whisper_linux.go     # //go:build linux — Vulkan CGo directives
│   │   └── whisper_windows.go   # //go:build windows — Vulkan CGo directives
│   └── server/                  # HTTP handlers (later)
├── scripts/
│   └── download-libs.sh         # fetch prebuilt libs from GH releases
├── Makefile
├── go.mod
└── CLAUDE.md
```

## CGo Directives Per Platform

### `whisper_darwin.go`

```go
//go:build darwin

package whisper

/*
#cgo CFLAGS: -I${SRCDIR}/../../third_party/whisper.cpp/include
#cgo LDFLAGS: -L${SRCDIR}/../../third_party/whisper.cpp/lib/darwin
#cgo LDFLAGS: -lwhisper -lggml -lggml-base -lggml-cpu -lggml-metal -lggml-blas
#cgo LDFLAGS: -framework Accelerate -framework Metal -framework Foundation -framework MetalKit -framework CoreGraphics
#cgo LDFLAGS: -lstdc++
#include <whisper.h>
*/
import "C"
```

### `whisper_linux.go`

```go
//go:build linux

package whisper

/*
#cgo CFLAGS: -I${SRCDIR}/../../third_party/whisper.cpp/include
#cgo LDFLAGS: -L${SRCDIR}/../../third_party/whisper.cpp/lib/linux
#cgo LDFLAGS: -lwhisper -lggml -lggml-base -lggml-cpu -lggml-vulkan -lvulkan
#cgo LDFLAGS: -lstdc++ -lm -fopenmp
#include <whisper.h>
*/
import "C"
```

### `whisper_windows.go`

```go
//go:build windows

package whisper

/*
#cgo CFLAGS: -I${SRCDIR}/../../third_party/whisper.cpp/include
#cgo LDFLAGS: -L${SRCDIR}/../../third_party/whisper.cpp/lib/windows
#cgo LDFLAGS: -lwhisper -lggml -lggml-base -lggml-cpu -lggml-vulkan -lvulkan-1
#cgo LDFLAGS: -lstdc++
#include <whisper.h>
*/
import "C"
```

## GitHub Actions: Build Prebuilt Libs

One workflow, three jobs:

### macOS

```bash
cmake -S . -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON
cmake --build build --config Release
```

### Linux

```bash
cmake -S . -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_VULKAN=ON
cmake --build build --config Release
```

Requires: `vulkan-sdk` / `libvulkan-dev` + `glslc` (for shader compilation at build time).

### Windows

```bash
cmake -S . -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_VULKAN=ON
cmake --build build --config Release
```

Requires: Vulkan SDK installed.

### Artifact layout pushed to GH Release

```
whisper-libs-darwin-arm64.tar.gz
whisper-libs-darwin-x86_64.tar.gz
whisper-libs-linux-x86_64.tar.gz
whisper-libs-windows-x86_64.zip
```

Each archive contains:

```
include/
  whisper.h
  ggml.h
lib/
  libwhisper.a (or .lib)
  libggml.a
  libggml-base.a
  libggml-cpu.a
  libggml-metal.a      # macOS only
  libggml-blas.a        # macOS only
  libggml-vulkan.a      # Linux/Windows only
```

## `scripts/download-libs.sh`

Detects OS/arch, downloads the matching archive from the latest GH release, extracts to `third_party/whisper.cpp/`.

## Build Flow

```bash
# 1. Fetch prebuilt whisper.cpp libs
./scripts/download-libs.sh

# 2. Build
go build -o sona ./cmd/sona/

# 3. Run (Linux/Windows users need libvulkan installed)
./sona transcribe audio.wav
```

## Runtime Dependencies

| Platform | User must have installed |
|----------|------------------------|
| macOS | Nothing (frameworks are part of macOS) |
| Linux | Vulkan-capable GPU driver (provides `libvulkan.so`) |
| Windows | Vulkan-capable GPU driver (provides `vulkan-1.dll`) |

## First Steps (ordered)

1. `go mod init github.com/<owner>/sona`
2. Scaffold `internal/whisper/` with the three platform-specific CGo files + common API
3. Write `scripts/download-libs.sh`
4. Write GitHub Actions workflow to build whisper.cpp libs for all 3 platforms
5. `cmd/sona/main.go` — accept a WAV file, resample, transcribe via `internal/whisper`
6. Add HTTP server layer later
