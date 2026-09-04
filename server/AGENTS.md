# Claude Development Notes

## Package Managers
- JavaScript/Node.js: `pnpm` (sometimes `pnpx`)
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
## File size

700 lines max. On hitting it, ask before splitting.

Split by responsibility into halves — find where the file does two jobs and move one out whole. Not a line-count cut, not a `utils` skim. Keep the public API where callers expect it; move tests with their code.
