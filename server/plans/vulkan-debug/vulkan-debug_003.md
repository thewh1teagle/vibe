# Vulkan Crash Debug — Full Investigation

## Problem

`sona.exe` segfaults (`PC=0x0`, null function pointer) during `whisper_full` when using the Vulkan backend on an AMD Radeon iGPU in MSYS2.

## Environment

- GPU: AMD Radeon(TM) Graphics (iGPU, `matrix cores: none`, `int dot: 0`)
- OS: Windows, MSYS2 MINGW64 shell
- whisper.cpp commit: `aa1bc0d1a6dfd70dbb9f60c11df12441e03a9075`
- Go linker: `go build` with cgo, uses `gcc` as external linker

## Root cause

**`-static-libgcc` causes `gcc` to link `-lgcc_eh` (static exception handling). The C++ code in ggml-vulkan requires `-lgcc_s` (shared libgcc with SEH support, provided by `libgcc_s_seh-1.dll`).**

Without proper SEH unwinding, a function pointer in the Vulkan dispatch path resolves to null → crash at `PC=0x0`.

### How we found it

1. Built whisper.cpp locally from source — `whisper-cli` works perfectly with Vulkan.
2. Wrote `test_whisper.c` (minimal C program doing the same as sona) — crashes.
3. Compared the cmake link command for whisper-cli vs our gcc command.
4. Discovered `c++` linker works, `gcc` linker crashes, with identical flags and libs.
5. Diffed the verbose link output (`-v`):
   - `c++` implicitly links: `-lgcc_s` (shared libgcc with SEH)
   - `gcc` implicitly links: `-lgcc_eh` (static exception handling)
6. Confirmed: `gcc ... -lgcc_s` → **works**. `gcc` without it → **crashes**.

### Proof

Same source, same flags, same static libs:

```
gcc ... -lstdc++             → CRASH (uses -lgcc_eh by default)
gcc ... -lstdc++ -lgcc_s     → WORKS
c++ ...                      → WORKS (implicitly uses -lgcc_s)
```

## Fix applied

In `internal/whisper/whisper_windows.go`, changed:

```diff
-#cgo LDFLAGS: -lvulkan-1 -lstdc++ -lm -lpthread -lgomp
-#cgo LDFLAGS: -static-libstdc++ -static-libgcc
+#cgo LDFLAGS: -lvulkan-1 -lstdc++ -lm -lpthread -lgomp -lgcc_s
+#cgo LDFLAGS: -static-libstdc++
```

Sona now transcribes successfully with Vulkan on the AMD iGPU.

## Current runtime DLL dependencies (non-system)

```
libgcc_s_seh-1.dll  → /mingw64/bin/  (required for SEH/Vulkan)
libgomp-1.dll       → /mingw64/bin/  (OpenMP threading)
libwinpthread-1.dll → /mingw64/bin/  (POSIX threads)
libstdc++-6.dll     → /mingw64/bin/  (C++ runtime — should be static but still showing)
```

## Next: standalone binary (no MinGW deps)

Goal: `sona.exe` should work in cmd.exe/PowerShell with only the system `vulkan-1.dll` (shipped with GPU drivers) as an external dependency.

Static lib versions exist in MSYS2 for gomp, winpthread, and stdc++:
- `/mingw64/lib/libgomp.a` (static)
- `/mingw64/lib/libwinpthread.a` (static)
- `-static-libstdc++` flag (already present but may not be effective)

The constraint: `libgcc_s_seh-1.dll` **cannot** be statically linked — that's the whole point of the fix. Options:

1. **Ship `libgcc_s_seh-1.dll` alongside sona.exe** — simplest, ~100KB DLL, copy it next to the binary in CI. Statically link everything else with `-Wl,-Bstatic -lgomp -lwinpthread -Wl,-Bdynamic`.

2. **Investigate if libgcc_s can be statically linked differently** — unlikely, since the SEH unwinding tables need to be shared across all DLLs in the process.

3. **Switch to clang/MSVC toolchain** — avoids the gcc runtime entirely but is a larger change.

## Other files changed

- `BUILDING.md` — added `mingw-w64-x86_64-shaderc` to MSYS2 package list

## Temporary debug artifacts (can be deleted)

- `test_whisper.c`, `test_whisper.exe`, `test_cxx.exe`, `test_gcc.exe`, `test_gccs.exe`
- `stdout_*.txt`, `stderr_*.txt`
- `whisper-src/`, `whisper-build/`
- `vulkan-1.dll.bak`
