---
name: aptabase-analytics-report
description: Export and analyze Vibe Aptabase analytics for recent time windows or existing CSV exports, with emphasis on failure rates, affected users, app versions, and OS breakdowns. Use when Codex needs to: (1) export recent analytics with `scripts/export_analytics.py`, (2) filter an export to the exact last N hours, (3) restrict analysis to specific `app_version` values, (4) quantify the impact of the current failure-related events defined in the repository, or (5) produce a concise reliability report with fix suggestions.
---

# Aptabase Analytics Report

## Overview

Use this skill to export Aptabase telemetry from the Vibe repo, trim day-granularity exports to an exact time window, and produce a reliability report from the CSV with inline `uv` + pandas commands.

## Prerequisites

The export script requires a `.env` file at the repo root with these variables:

- `BASE_URL` – Aptabase server URL
- `AUTH_SECRET` – JWT signing secret
- `AUTH_NAME` – account name
- `AUTH_EMAIL` – account email
- `APP_KEY` – app key (e.g. `A-SH-0194598703`)
- `APTABASE_REGION` – optional, defaults to `"SH"`

## CSV Schema

The exported CSV contains these columns:

| Column          | Description                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `timestamp`     | UTC timestamp of the event                                                                                 |
| `event_name`    | Event identifier (see event lifecycle below)                                                               |
| `user_id`       | Anonymous user identifier                                                                                  |
| `app_version`   | Semantic version of the app                                                                                |
| `os_name`       | OS family (e.g. `Windows`, `macOS`, `Linux Mint`)                                                          |
| `os_version`    | OS version string                                                                                          |
| `string_props`  | JSON object with event metadata. Failure events contain an `error_message` key with the full error string. |
| `numeric_props` | JSON object with numeric event metadata                                                                    |

## Workflow

### 1. Confirm the event set

Read these files before interpreting the export:

- `desktop/src-tauri/src/analytics.rs`
- `desktop/src/lib/analytics.ts`

Treat those files as the source of truth for the current event set. Events follow these patterns:

- **Lifecycle events:** `<action>_started` → `<action>_succeeded` / `<action>_failed`
- **Infrastructure failures:** `<component>_<failure_type>` (e.g. spawn failures)

Identify which events are starts, successes, and failures. Do not assume specific event names are stable across revisions.

### 2. Export enough UTC days for the requested window

`scripts/export_analytics.py` accepts day-granularity dates, `start` inclusive and `end` exclusive. To analyze the last N hours, export the full UTC days that overlap the window, then filter afterward.

For the last 48 hours:

```bash
python3 - <<'PY'
from datetime import datetime, timedelta, timezone
now = datetime.now(timezone.utc)
print((now - timedelta(hours=48)).strftime("%Y-%m-%d"))
print((now + timedelta(days=1)).strftime("%Y-%m-%d"))
PY
```

Then export:

```bash
uv run scripts/export_analytics.py \
  --start-date YYYY-MM-DD \
  --end-date YYYY-MM-DD \
  --output scripts/analytics_last_48h_raw.csv
```

### 3. Analyze with inline pandas every time

Do not rely on a bundled analysis script. Use ad hoc inline Python with `uv` so the analysis stays easy to adapt as the repo changes.

Start with a minimal trim. Use all app versions unless the user specifies otherwise. To restrict, filter to the N most recent versions by event count rather than hardcoding version strings.

```bash
uv run --with pandas==3.0.0 python - <<'PY'
from datetime import timedelta
import pandas as pd

df = pd.read_csv("scripts/analytics_last_48h_raw.csv")
df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)

end_time = df["timestamp"].max()
cutoff = end_time - timedelta(hours=48)
filtered = df[df["timestamp"] >= cutoff].copy()
filtered = filtered.sort_values("timestamp", ascending=False).reset_index(drop=True)
filtered["timestamp"] = filtered["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")
filtered.to_csv("scripts/analytics_last_48h.csv", index=False)

print(f"rows={len(filtered)}")
print(f"time_min={filtered['timestamp'].min()}")
print(f"time_max={filtered['timestamp'].max()}")
PY
```

Then run additional inline pandas passes as needed. Prefer several small targeted scripts over one large script:

- one pass for headline counts and global rates
- one pass for affected users and happy users
- one pass for OS, OS version, and app version breakdowns
- one pass for parsing `string_props` / `numeric_props` and clustering error messages

Keep iterating until the causes are clear. The skill should adapt the analysis to the actual export contents, not force one fixed taxonomy.

### 4. Interpret the report

Prioritize these metrics:

- Global raw error rate: `(current failure-class events) / all events`
- Primary workflow failure rate: `(current failure-class events) / (matching start-class events)` when the lifecycle is present
- Affected users: unique `user_id` values with any failure-class event
- Happy users: users with at least one success-class event and no failure-class events
- OS risk: failure rate and affected-user share by OS family and OS name

Separate user-input mistakes from runtime, environment, and packaging failures. A small number of users can generate many repeated input errors and distort the raw event-level error rate.

### 5. Suggest fixes from the observed buckets

Build buckets from the current data, then map the high-volume failures to code paths before proposing changes:

- `desktop/src-tauri/src/sona.rs`: spawn, load-model, and transcribe HTTP failures
- `desktop/src-tauri/src/cmd/mod.rs`: input validation and surfaced transcription errors

Read `references/error-buckets.md` for the general workflow on discovering the current event set and deriving buckets from the current repository state.

## Output Expectations

Keep the final report compact but complete:

- State the exact time range, filters, row count, and active users
- Report event counts and version counts
- Separate raw error rate from runtime-like error rate
- Give affected-user counts, happy-user counts, and user share percentages
- Break down failures by OS family, OS name, app version, and top issue buckets
- End with prioritized fix suggestions tied to likely code paths

## Done Checklist

Before finishing, verify your report includes all of these:

- [ ] Exact time range and any filters applied
- [ ] Total row count and active user count
- [ ] Event counts by event name
- [ ] Raw error rate and workflow failure rate (failures / starts)
- [ ] Affected user count and percentage
- [ ] Happy user count (success, no failures)
- [ ] Failure breakdown by OS
- [ ] Failure breakdown by app version
- [ ] Top 5+ error buckets with counts (parsed from `string_props.error_message`)
- [ ] Fix suggestions tied to code paths (for deep analysis)

## Resources

### references/error-buckets.md

Read this file when you need a general checklist for discovering event names, deriving buckets from the current data, and tying findings back to the right code.
