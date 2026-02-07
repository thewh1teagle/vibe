# Claude Development Notes

## Package Managers
- JavaScript/Node.js: `pnpm` (sometimes `pnpx`)
  - The entire repo uses pnpm only (no alternative JS package managers)
  - Install deps: `pnpm install`
  - Run scripts: `pnpm <script>` (e.g. `pnpm dev`, `pnpm build`)
  - Execute packages: `pnpm exec <cmd>` or `pnpx <cmd>`
- Python: `uv`
  - Add deps to scripts: `uv add --script example.py <packages> --bounds exact`
  - Run scripts: `uv run example.py`
  - Create scripts: `uv init --script example.py --python 3.12`
  - Run inline: `uv run python -c "print('Hello, world!')"`

## Validation

For each plan, you can create self-contained validation scripts.

Structure:
- `plans/<name>/<name>_001.py`
- `plans/<name>/<name>_001.md`

Each Python file should be a standalone `uv` script with its own dependencies declared at the top.

Example:
```bash
uv run plans/<name>/<name>_001.py
```

## Execution Mindset

Think in agent mode, not human mode.
Assume nonstop focus, parallel moves, and instant iteration.
Push timelines aggressively, speed is the default.
If something feels heavy, split it until it becomes obvious and fast.
