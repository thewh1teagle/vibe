# Plan: Sona sidecar dev-mode bootstrapping

## Context

The sona integration (001) is complete and compiling on macOS. The release CI already downloads the correct sona binary per platform and places it in `desktop/src-tauri/binaries/sona-<target-triple>`. However, for **local development**, developers must manually build or download sona and place it in the right spot. This plan automates that — with `pre_build.py` as the **single source of truth** for downloading sona, used by both local dev and CI.

### Current state

- `tauri.conf.json` declares `"externalBin": ["binaries/sona"]`
- Tauri appends the host target triple automatically, so it looks for e.g. `binaries/sona-aarch64-apple-darwin`
- `desktop/src-tauri/binaries/` exists with `.gitkeep` and manually placed binaries
- `scripts/pre_build.py` handles platform setup (Linux apt deps, env vars, optional `--dev`/`--build` passthrough) but does **not** fetch sona
- Sona publishes raw binaries to GitHub releases at `thewh1teagle/sona` with names like `sona-darwin-arm64`, `sona-linux-amd64`, `sona-windows-amd64.exe`
- The release CI has its own separate `gh release download` step — **this duplication is what we're eliminating**

### Naming mismatch

Sona release assets use Go-style names (`sona-{goos}-{goarch}`), while Tauri expects Rust target triples (`sona-{arch}-{vendor}-{os}-{abi}`). The mapping:

| Sona release asset | Tauri sidecar name |
|-|-|
| `sona-darwin-arm64` | `sona-aarch64-apple-darwin` |
| `sona-darwin-amd64` | `sona-x86_64-apple-darwin` |
| `sona-linux-amd64` | `sona-x86_64-unknown-linux-gnu` |
| `sona-linux-arm64` | `sona-aarch64-unknown-linux-gnu` |
| `sona-windows-amd64.exe` | `sona-x86_64-pc-windows-msvc.exe` |

---

## Step 1: Pin sona version in the repo

Create a file `.sona-version` at the repo root containing the sona release tag to use (e.g. `v0.1.0`). This is the single source of truth for which sona version vibe uses.

**File:** `/.sona-version`
```
v0.1.0
```

---

## Step 2: Add `download_sona()` to `scripts/pre_build.py`

Add `httpx` as a dependency in the uv script header:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx"]
# ///
```

### Target triple mapping

Use a dict keyed by **Rust target triple** (since that's what both Tauri and the `--target` flag use):

```python
# Map Rust target triple → sona release asset name
SONA_TARGET_MAP = {
    "aarch64-apple-darwin":       "sona-darwin-arm64",
    "x86_64-apple-darwin":        "sona-darwin-amd64",
    "x86_64-unknown-linux-gnu":   "sona-linux-amd64",
    "aarch64-unknown-linux-gnu":  "sona-linux-arm64",
    "x86_64-pc-windows-msvc":     "sona-windows-amd64.exe",
}
```

### Auto-detecting the host target triple

When no `--target` is provided, detect the host triple from `platform.system()` + `platform.machine()`:

```python
HOST_TRIPLE_MAP = {
    ("Darwin", "arm64"):   "aarch64-apple-darwin",
    ("Darwin", "x86_64"):  "x86_64-apple-darwin",
    ("Linux", "x86_64"):   "x86_64-unknown-linux-gnu",
    ("Linux", "aarch64"):  "aarch64-unknown-linux-gnu",
    ("Windows", "AMD64"):  "x86_64-pc-windows-msvc",
}
```

### `--target` flag

Add `--target <rust-target-triple>` argument to the script. This is needed for CI cross-compilation (e.g. macOS arm64 runner building for x86_64 target).

- If provided, use the given target triple
- If not provided, auto-detect from host platform

### `download_sona(target_triple)` function

1. Read `.sona-version` from repo root (one directory up from `scripts/`)
2. Look up the sona asset name from `SONA_TARGET_MAP[target_triple]`
3. Compute sidecar filename: `sona-{target_triple}` (add `.exe` for windows targets)
4. Compute destination: `desktop/src-tauri/binaries/{sidecar_filename}`
5. If destination already exists → print skip message, return
6. Download from `https://github.com/thewh1teagle/sona/releases/download/{tag}/{asset_name}` using `httpx` with `follow_redirects=True`
7. Write to destination
8. `chmod +x` on non-Windows

### Integration into `main()`

```python
def main() -> int:
    # ... existing setup ...
    argv = sys.argv[1:]

    # Parse --target if provided
    target_triple = None
    for i, arg in enumerate(argv):
        if arg == "--target" and i + 1 < len(argv):
            target_triple = argv[i + 1]
            break

    # Download sona sidecar
    download_sona(target_triple)

    # ... rest of existing main() ...
```

### Error handling

- If download fails, print a warning with manual instructions but don't crash — the developer may have placed a locally-built sona binary already
- If the target triple is not in `SONA_TARGET_MAP`, print a warning

---

## Step 3: Update release CI to use `pre_build.py` for sona download

**File:** `.github/workflows/release.yml`

**Remove** the separate "Download Sona sidecar binary" step entirely. The existing "Run pre_build.py" step already runs — it just needs the `--target` flag passed.

Before:
```yaml
- name: Download Sona sidecar binary
  env:
    GH_TOKEN: ${{ github.token }}
  shell: bash
  run: |
    mkdir -p desktop/src-tauri/binaries
    gh release download --repo thewh1teagle/sona --pattern "${{ matrix.sona_asset }}" --dir desktop/src-tauri/binaries
    mv "desktop/src-tauri/binaries/${{ matrix.sona_asset }}" "desktop/src-tauri/binaries/${{ matrix.sidecar_name }}"

- name: Run pre_build.py on ${{ matrix.platform }}
  run: uv run scripts/pre_build.py
```

After:
```yaml
- name: Run pre_build.py on ${{ matrix.platform }}
  run: uv run scripts/pre_build.py --target ${{ matrix.target_triple }}
```

The matrix already has the target triple embedded in the `args` field (e.g. `--target aarch64-apple-darwin`). Add an explicit `target_triple` field to each matrix entry for clarity:

```yaml
matrix:
  include:
    - platform: "macos-latest"
      args: "--target aarch64-apple-darwin"
      target_triple: "aarch64-apple-darwin"
    - platform: "macos-latest"
      args: "--target x86_64-apple-darwin"
      target_triple: "x86_64-apple-darwin"
    - platform: "ubuntu-22.04"
      args: "--target x86_64-unknown-linux-gnu"
      target_triple: "x86_64-unknown-linux-gnu"
    - platform: "windows-latest"
      args: "--target x86_64-pc-windows-msvc"
      target_triple: "x86_64-pc-windows-msvc"
```

Remove `sona_asset` and `sidecar_name` from the matrix — they're no longer needed since `pre_build.py` handles the mapping internally.

---

## Step 4: Add `binaries/sona-*` to `.gitignore`

The sona binaries are ~13MB each and should not be committed. Add to the repo `.gitignore`:

```
desktop/src-tauri/binaries/sona-*
```

Keep the existing `.gitkeep` so the directory is tracked.

---

## Summary of changes

| File | Change |
|-|-|
| `.sona-version` | New — pins sona release tag |
| `scripts/pre_build.py` | Add `httpx` dep, `--target` flag, `download_sona()` function |
| `.github/workflows/release.yml` | Remove separate download step, pass `--target` to `pre_build.py`, drop `sona_asset`/`sidecar_name` from matrix |
| `.gitignore` | Add `desktop/src-tauri/binaries/sona-*` |

### Dev workflow (local)

```bash
uv run scripts/pre_build.py        # auto-detects platform, downloads sona
cd desktop && pnpm install && pnpm exec tauri dev

# Or all-in-one:
uv run scripts/pre_build.py --dev
```

### Dev workflow (CI)

```bash
uv run scripts/pre_build.py --target aarch64-apple-darwin   # explicit target for cross-compile
```

### What happens

1. `pre_build.py` reads `.sona-version` → `v0.1.0`
2. Resolves target triple (from `--target` flag or auto-detected host)
3. Maps `aarch64-apple-darwin` → asset `sona-darwin-arm64`
4. Downloads from `thewh1teagle/sona` releases `v0.1.0`
5. Saves as `desktop/src-tauri/binaries/sona-aarch64-apple-darwin`
6. `chmod +x`
7. Tauri dev/build finds it via `externalBin: ["binaries/sona"]`
