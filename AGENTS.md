# Development Notes

Project-specific rules [`docs/PROJECT.md`](docs/PROJECT.md).

## Tooling

- Tasks: `chore` — see `chore list`
- JS: `pnpm` only; Python: `uv` standalone scripts (`uv run`)

## Plans & validation

The root folder is holy: put all plan and scratch files under `plans/`, never in the root.

Plan validation scripts: `plans/<name>/<name>_001.py` (+ `.md`), standalone `uv` scripts.

## Execution Mindset

Agent mode: parallel moves, instant iteration, speed by default. Split heavy work until obvious. Estimate by output size — 300 lines = minutes. Correct over easy: rework is slower than doing it right once. Plan resolved → execute, don't re-analyze.

## Working in parallel

Split large tasks across 4–5 strong subagents, each owning a separate module group with no overlapping files. Define interfaces and design contracts first. Delegate bulk implementation; keep planning, shared/root config, and integration with the coordinator. Parallelize independent work for speed, allowing for coordination overhead.


## ETA rule

Quote minutes, never days: single tasks 1–10 min, multi-agent work tens of minutes.

```
minutes ≈ (LOC × 40) / (6000 × N_agents) + ~2 min per stage
```

## File size

700 lines max. On hitting it, ask before splitting.

Split by responsibility into halves — find where the file does two jobs and move one out whole. Not a line-count cut, not a `utils` skim. Keep the public API where callers expect it; move tests with their code.

## Commits

No `Co-Authored-By` or session trailers in commit messages. Plain subject line, optional short body.

## No long sleeps

The user is watching the screen. Never park a command on `sleep 60` or similar to "be sure". Probe cheaply and return: read the log tail, `nvidia-smi`, a pid check, then report. If a wait is unavoidable, run it in the background and report when it fires.