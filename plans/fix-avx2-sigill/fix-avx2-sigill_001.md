# Fix: SIGILL crash on CPUs without AVX2

## Problem

7 out of 16 `transcribe_failed` events in v3.0.18 are caused by `SIGILL` (illegal instruction) when sona loads the whisper model. Affected platforms: **Windows** (5 events) and **Fedora Linux** (2 events). Zero macOS failures.

Root cause: the sona binary is compiled on CI with `GGML_NATIVE=ON` (the default). GitHub Actions runners are Azure VMs with modern Intel CPUs that have AVX2, FMA, F16C, BMI2. The resulting binary unconditionally uses these instructions and crashes with `SIGILL` on older CPUs (pre-Haswell, ~pre-2013) that lack AVX2.

Error signatures observed:
- Windows: `Exception 0xc000001d` (STATUS_ILLEGAL_INSTRUCTION)
- Linux: `SIGILL: illegal instruction` at `PC=0x7ed010`

Both crash during `load_model`, before any audio is processed.

There is no runtime flag in ggml/whisper.cpp to disable AVX2 — code paths are selected at compile time via `#ifdef __AVX2__`. A recompile is required.

---

## Solution: two independent parts

### Part 1 — CPUID check in Vibe before spawning sona (ship first)

**Repo:** `vibe/desktop`

`x86_features.rs` already has `is_x86_feature_detected!("avx2")` logic. The missing piece is acting on it **before** `SonaProcess::spawn()` is called in `cmd/mod.rs`.

On `#[cfg(all(target_arch = "x86_64", not(target_os = "macos")))]`, before spawning:

```rust
let features = X86features::new();
if features.avx2.enabled && !features.avx2.support {
    bail!(
        "Your CPU does not support AVX2 instructions required by this version of Vibe.\n\
         Download the compatible version from:\n\
         https://github.com/thewh1teagle/vibe/releases/latest"
    );
}
```

- `features.avx2.enabled` = sona was compiled with AVX2 (true by default today)
- `features.avx2.support` = false means the CPU can't run it → error before crash

Gives users a clear actionable message instead of a cryptic crash. Zero perf impact.

**Effort:** ~15 lines, 30 min.

---

### Part 2 — Ship a noavx2 sona binary (follow-up)

**Repo:** `sona`

#### 2a. Build two sets of static libs (`build-libs.py`)

Add `--no-avx2` flag that produces a second tarball compiled without AVX2/FMA/F16C/BMI2, targeting SSE4.2 + AVX (Sandy Bridge 2011+):

```python
# cmake_flags() extra flags for noavx2 variant (Linux/Windows only):
"-DGGML_NATIVE=OFF",
"-DGGML_AVX2=OFF",
"-DGGML_FMA=OFF",
"-DGGML_F16C=OFF",
"-DGGML_BMI2=OFF",
```

Produces: `whisper-libs-linux-x86_64-noavx2.tar.gz`, `whisper-libs-windows-x86_64-noavx2.tar.gz`

#### 2b. Release workflow: build and upload two sona binaries

Extend the `Release sona` workflow to:
1. Download noavx2 libs via `download-libs.py --variant noavx2`
2. `go build -o sona-noavx2` linked against noavx2 libs
3. Upload both `sona` and `sona-noavx2` to the GitHub release

#### 2c. Download flow in Vibe

**Option A — Manual (ships with Part 1):**
The error message already includes the releases link. User downloads `sona-noavx2`, replaces their sona binary manually. No extra Vibe code needed.

**Option B — Auto-download (follow-up):**
When Part 1 detects no AVX2:
1. Show a one-time dialog: *"Your CPU needs a compatible version. Download now? (~15 MB)"*
2. Vibe downloads `sona-noavx2` from GitHub releases for the current sona version
3. Places it next to sona (e.g. `sona-noavx2.exe`)
4. On CPUs without AVX2, Vibe always prefers `sona-noavx2`

Option B is seamless but requires download logic + persistent state in Vibe. **Start with Option A.**

---

## Ship order

1. **Part 1** — CPUID check + error message with link → fixes UX immediately
2. **Part 2a + 2b** — publish the noavx2 binary the link points to
3. **Part 2c Option B** — auto-download (optional, if manual flow gets complaints)

---

## Out of scope (separate issues from same analytics export)

- `whisper: transcription failed with code -7` (4 events) — whisper internal encode error
- `failed to send transcribe request to sona` (5 events, 1 repeated user) — sona crash during transcription
- `sona load_model failed` (1 event) — corrupted/missing model file, user-side
