# Plan: Replace bun with pnpm everywhere

## Context

The project already has `pnpm-lock.yaml` in `desktop/` and `landing/`, and `CLAUDE.md` already says to use `pnpm`. But many files still reference `bun` / `bunx` — CI workflows, Tauri config, build scripts, and docs. This plan removes every bun reference and replaces with pnpm equivalents.

**Mapping:**
| bun | pnpm |
|-|-|
| `bun install` | `pnpm install` |
| `bun run dev` | `pnpm dev` |
| `bun run build` | `pnpm build` |
| `bunx <cmd>` | `pnpm exec <cmd>` or `pnpx <cmd>` |
| `bun i -D` | `pnpm install` |
| `oven-sh/setup-bun@v1` | `pnpm/action-setup@v4` |
| `bun.lockb` | (delete) |

---

## Change 1: CI — `.github/workflows/lint_rust.yml`

Replace bun setup + commands:

```yaml
# Before
- name: setup Bun
  uses: oven-sh/setup-bun@v1

- name: install node deps
  run: bun install
  working-directory: ./desktop
- name: build react
  run: bun run build
  working-directory: ./desktop
```

```yaml
# After
- name: setup pnpm
  uses: pnpm/action-setup@v4

- name: setup Node.js
  uses: actions/setup-node@v4
  with:
      node-version: 22
      cache: pnpm
      cache-dependency-path: desktop/pnpm-lock.yaml

- name: install node deps
  run: pnpm install
  working-directory: ./desktop
- name: build react
  run: pnpm build
  working-directory: ./desktop
```

Note: `pnpm/action-setup@v4` reads the `packageManager` field from `package.json` to pick the pnpm version. We should add `"packageManager": "pnpm@10.4.1"` (or latest) to `desktop/package.json` and `landing/package.json`. The `actions/setup-node` step enables caching via pnpm.

---

## Change 2: CI — `.github/workflows/release.yml`

```yaml
# Before (line 31-32)
- name: setup Bun
  uses: oven-sh/setup-bun@v1

# Before (line 46-48)
- name: Install frontend dependencies
  run: bun install
  working-directory: ./desktop

  # Before (line 90)
  tauriScript: bunx tauri
```

```yaml
# After
- name: setup pnpm
  uses: pnpm/action-setup@v4

- name: setup Node.js
  uses: actions/setup-node@v4
  with:
      node-version: 22
      cache: pnpm
      cache-dependency-path: desktop/pnpm-lock.yaml

- name: Install frontend dependencies
  run: pnpm install
  working-directory: ./desktop

  # Line 90 — tauriScript
  tauriScript: pnpm exec tauri
```

---

## Change 3: CI — `.github/workflows/landing.yml`

```yaml
# Before (line 31-32)
- name: setup Bun
  uses: oven-sh/setup-bun@v1

# Before (line 38-43)
- name: Build
  run: |
      bun install
      uv run ../scripts/landing_links.py
      cp -rf ../docs static/
      bun run build
  working-directory: landing
```

```yaml
# After
- name: setup pnpm
  uses: pnpm/action-setup@v4

- name: setup Node.js
  uses: actions/setup-node@v4
  with:
      node-version: 22
      cache: pnpm
      cache-dependency-path: landing/pnpm-lock.yaml

- name: Build
  run: |
      pnpm install
      uv run ../scripts/landing_links.py
      cp -rf ../docs static/
      pnpm build
  working-directory: landing
```

---

## Change 4: Tauri config — `desktop/src-tauri/tauri.conf.json`

```json
// Before (line 24-25)
"beforeDevCommand": "bun run dev",
"beforeBuildCommand": "bun run build",

// After
"beforeDevCommand": "pnpm dev",
"beforeBuildCommand": "pnpm build",
```

---

## Change 5: Build script — `scripts/pre_build.py`

Three references:

**Line 152** (print instructions):

```python
# Before
print("bun install")
# After
print("pnpm install")
```

**Line 158** (print instructions):

```python
# Before
print("bunx tauri build")
# After
print("pnpm exec tauri build")
```

**Lines 174-175** (actual commands):

```python
# Before
run_cmd("bun", "install")
run_cmd("bunx", "tauri", "dev" if "--dev" in action_arg else "build")

# After
run_cmd("pnpm", "install")
run_cmd("pnpm", "exec", "tauri", "dev" if "--dev" in action_arg else "build")
```

---

## Change 6: Documentation — `docs/building.md`

All bun references → pnpm:

| Line | Before                                            | After                                               |
| ---- | ------------------------------------------------- | --------------------------------------------------- |
| 5    | `[Bun](https://bun.sh/)`                          | `[pnpm](https://pnpm.io/)`                          |
| 40   | `bun run scripts\pre_build.js --vulkan`           | `pnpm exec scripts\pre_build.js --vulkan`           |
| 61   | `bun install`                                     | `pnpm install`                                      |
| 67   | `bun scripts/pre_build.js`                        | `pnpm exec scripts/pre_build.js`                    |
| 105  | `bun run scripts/pre_build.js --openblas --build` | `pnpm exec scripts/pre_build.js --openblas --build` |
| 114  | `bun scripts/pre_build.js --amd`                  | `pnpm exec scripts/pre_build.js --amd`              |
| 121  | `bunx tauri build`                                | `pnpm exec tauri build`                             |
| 207  | `bunx tinypng-go static/*.png`                    | `pnpx tinypng-go static/*.png`                      |
| 245  | `bun i -D`                                        | `pnpm install`                                      |
| 246  | `bunx ncu -u`                                     | `pnpx ncu -u`                                       |
| 272  | `bun run scripts/pre_build.js`                    | `pnpm exec scripts/pre_build.js`                    |

Note: `docs/building.md` still references `pre_build.js` (old name). These should probably be `pre_build.py` — but that's a separate fix. This plan only addresses bun → pnpm.

---

## Change 7: Delete bun lock files

```
rm bun.lockb
rm desktop/bun.lockb
rm landing/bun.lockb
```

These are binary files. `pnpm-lock.yaml` already exists in `desktop/` and `landing/`.

---

## Change 8: Plan file — `plans/sona-integration/sona-integration_002.md`

**Line 201:**

```
# Before
cd desktop && bun install && bunx tauri dev
# After
cd desktop && pnpm install && pnpm exec tauri dev
```

---

## Change 9: Add `packageManager` field to `package.json` files

Both `desktop/package.json` and `landing/package.json` should declare:

```json
"packageManager": "pnpm@10.4.1"
```

This lets `pnpm/action-setup@v4` auto-detect the correct version in CI. Use whatever the latest stable pnpm version is.

---

## Change 10: Update `CLAUDE.md`

Add a note under the existing `pnpm` entry to make it clear this is a project-wide standard:

```markdown
## Package Managers

- JavaScript/Node.js: `pnpm` (sometimes `pnpx`)
    - The entire repo uses pnpm — no bun, npm, or yarn
    - Install deps: `pnpm install`
    - Run scripts: `pnpm <script>` (e.g. `pnpm dev`, `pnpm build`)
    - Execute packages: `pnpm exec <cmd>` or `pnpx <cmd>`
- Python: `uv`
  ...
```

---

## Summary

| File                                                  | Change                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `.github/workflows/lint_rust.yml`                     | `oven-sh/setup-bun` → `pnpm/action-setup` + `setup-node`, `bun` → `pnpm` |
| `.github/workflows/release.yml`                       | Same + `bunx tauri` → `pnpm exec tauri`                                  |
| `.github/workflows/landing.yml`                       | Same                                                                     |
| `desktop/src-tauri/tauri.conf.json`                   | `bun run dev/build` → `pnpm dev/build`                                   |
| `scripts/pre_build.py`                                | `bun`/`bunx` → `pnpm`/`pnpm exec`                                        |
| `docs/building.md`                                    | All `bun`/`bunx` → `pnpm`/`pnpx`                                         |
| `plans/sona-integration/sona-integration_002.md`      | `bun`/`bunx` → `pnpm`/`pnpm exec`                                        |
| `desktop/package.json`                                | Add `"packageManager": "pnpm@10.4.1"`                                    |
| `landing/package.json`                                | Add `"packageManager": "pnpm@10.4.1"`                                    |
| `CLAUDE.md`                                           | Expand pnpm section with usage examples                                  |
| `bun.lockb`, `desktop/bun.lockb`, `landing/bun.lockb` | Delete                                                                   |
