# Vulkan Crash Debug

## Problem

`sona.exe` segfaults (`PC=0x0`) during `whisper_full` when using the Vulkan backend on Windows (MSYS2/MinGW).

## Root cause

`-static-libgcc` (the original cgo LDFLAGS) causes `gcc` to link `-lgcc_eh` (static exception handling). The C++ code in ggml-vulkan requires `-lgcc_s` (shared libgcc with SEH support, provided by `libgcc_s_seh-1.dll`).

Without proper SEH unwinding, a function pointer in the Vulkan dispatch path resolves to null → crash at `PC=0x0`.

## How we found it

1. Built whisper.cpp locally — `whisper-cli` works perfectly with Vulkan
2. Wrote `test_whisper.c` (same calls as sona) — crashes with `gcc`, works with `c++`
3. Diffed verbose link output (`gcc -v` vs `c++ -v`):
   - `c++` implicitly links `-lgcc_s` (shared libgcc with SEH)
   - `gcc` implicitly links `-lgcc_eh` (static exception handling)
4. Confirmed: `gcc ... -lgcc_s` works, `gcc` without it crashes

## Fix

Replace `-static-libgcc` with `-lgcc_s` (or `-shared-libgcc` via extldflags) in the cgo LDFLAGS:

```diff
-#cgo LDFLAGS: -static-libstdc++ -static-libgcc
+#cgo LDFLAGS: -lgcc_s
```

This requires `libgcc_s_seh-1.dll` at runtime (ships alongside the binary).
