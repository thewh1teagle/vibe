# Static Linking on Windows (MinGW/cgo)

## Goal

Ship `sona.exe` standalone — no MinGW DLLs on PATH, only system `vulkan-1.dll` (from GPU driver).

## Tricks found

### 1. `-Wl,-Bstatic` / `-Wl,-Bdynamic` for selective static linking

cgo LDFLAGS can mix static and dynamic linking:

```
#cgo LDFLAGS: -Wl,-Bstatic -lstdc++ -lgomp -lwinpthread -Wl,-Bdynamic
```

This statically links stdc++, gomp, and winpthread while keeping other libs dynamic. Requires the static `.a` variants to exist in the MSYS2 sysroot (they do: `/mingw64/lib/libgomp.a`, `/mingw64/lib/libwinpthread.a`).

### 2. `-shared-libgcc` must go through `-extldflags`

cgo's flag security check rejects `-shared-libgcc` in `#cgo LDFLAGS`. Pass it via Go linker flags instead:

```bash
go build -ldflags '-extldflags "-shared-libgcc"' -o sona.exe ./cmd/sona/
```

### 3. `-lpthread` vs `-lwinpthread`

`-lpthread` resolves to the DLL import lib. Use `-lwinpthread` explicitly to get the static version when inside a `-Wl,-Bstatic` block.

### 4. `libgcc_s_seh-1.dll` pulls in `libwinpthread-1.dll`

Even if you statically link winpthread into your binary, `libgcc_s_seh-1.dll` itself depends on `libwinpthread-1.dll`. Both DLLs must be shipped together.

### 5. `-static-libstdc++` flag

The `-static-libstdc++` gcc driver flag is accepted by cgo LDFLAGS but may not be effective when Go's linker reorders flags. Using `-Wl,-Bstatic -lstdc++` is more reliable.

## Final LDFLAGS

```go
#cgo LDFLAGS: -lwhisper -lggml -lggml-base -lggml-cpu -lggml-vulkan
#cgo LDFLAGS: -lvulkan-1 -lm
#cgo LDFLAGS: -Wl,-Bstatic -lstdc++ -lgomp -lwinpthread -Wl,-Bdynamic
```

Build command:
```bash
CGO_ENABLED=1 go build -ldflags '-extldflags "-shared-libgcc"' -o sona.exe ./cmd/sona/
```

## Runtime dependencies

| DLL | Source | Why |
|-----|--------|-----|
| `libgcc_s_seh-1.dll` | Ship with binary (~100KB) | SEH unwinding for Vulkan C++ code |
| `libwinpthread-1.dll` | Ship with binary (~46KB) | Dependency of libgcc_s_seh-1.dll |
| `vulkan-1.dll` | System (GPU driver) | Vulkan runtime |

Everything else (stdc++, gomp, winpthread for the binary itself) is statically linked.
