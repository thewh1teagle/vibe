# Claude Development Notes

## Tooling

- Tasks: `chore` — see `chore list`
- JS: `pnpm` only; Python: `uv` standalone scripts (`uv run`)

## Validation

Plan validation scripts: `plans/<name>/<name>_001.py` (+ `.md`), standalone `uv` scripts.

## Skills

Custom skills live in `.claude/skills/<name>/SKILL.md`.

## Execution Mindset

Agent mode: parallel moves, instant iteration, speed by default. Split heavy work until obvious. Estimate by output size — 300 lines = minutes. Correct over easy: rework is slower than doing it right once. Plan resolved → execute, don't re-analyze.

## Working in parallel

Split large work across ~4–5 subagents, one disjoint module-group each — no shared files; only the coordinator touches shared/root config. Fix contracts (interfaces, design docs) up front. Throughput is per-agent (~100 tok/s, no global limit), so N agents ≈ N× speed — delegate bulk implementation to strong subagents (e.g. Opus 5 for correctness-sensitive code); keep the main loop for planning, contracts, and integration.

## ETA rule

Quote minutes, never days: single tasks 1–10 min, multi-agent work tens of minutes.

```
minutes ≈ (LOC × 40) / (6000 × N_agents) + ~2 min per stage
```

## File size

700 lines max. On hitting it, ask before splitting.

Split by responsibility into halves — find where the file does two jobs and move one out whole. Not a line-count cut, not a `utils` skim. Keep the public API where callers expect it; move tests with their code.
