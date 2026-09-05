---
name: analytics
description: Pull Vibe's Aptabase telemetry into a CSV — export a date range with scripts/export_analytics.py, trim it to an exact time window, and read the event set from the source. Use when the user asks about analytics, telemetry, Aptabase, crash or failure rates, affected users, or version and OS breakdowns.
---

# Analytics

Gets you the data. What to do with it is your call — read the question and answer
it, rather than producing a fixed report.

## Prerequisites

`scripts/export_analytics.py` calls `load_dotenv()`, so a `.env` at the repo root
supplies: `BASE_URL`, `AUTH_SECRET`, `AUTH_NAME`, `AUTH_EMAIL`, `APP_KEY`, and
optionally `APTABASE_REGION` (defaults to `SH`).

## Export

Dates are UTC and day-granular: `--start-date` inclusive, `--end-date` exclusive.
For a window in hours, export the days that overlap it and trim afterwards.

```bash
uv run scripts/export_analytics.py \
  --start-date YYYY-MM-DD --end-date YYYY-MM-DD \
  --output scripts/analytics_raw.csv
```

Also takes `--format csv|parquet` and `--build-mode release|debug` (default
`release` — debug rows are developer machines).

## Columns

| Column | |
|---|---|
| `timestamp` | UTC |
| `event_name` | see below |
| `user_id` | anonymous |
| `app_version` | |
| `os_name` / `os_version` | e.g. `Windows`, `macOS`, `Linux Mint` |
| `string_props` | JSON; failures carry `error_message` with the full string |
| `numeric_props` | JSON |

## The event set

Read it from the code, never from memory — names change:

- `desktop/src-tauri/src/analytics.rs`
- `desktop/src/lib/analytics.ts`

The shapes are `<action>_started` → `<action>_succeeded` / `<action>_failed`, and
`<component>_<failure_type>` for infrastructure faults. Work out which of the
current names are starts, successes and failures before computing any rate.

## Trimming to an exact window

```bash
uv run --with pandas python - <<'PY'
from datetime import timedelta
import pandas as pd

df = pd.read_csv("scripts/analytics_raw.csv")
df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
df = df[df["timestamp"] >= df["timestamp"].max() - timedelta(hours=48)]
df.to_csv("scripts/analytics_window.csv", index=False)
print(len(df), df["timestamp"].min(), df["timestamp"].max())
PY
```

From here, inline pandas passes over the CSV answer most questions. A few things
worth knowing when you interpret them: a handful of users can repeat the same
input mistake and dominate an event-level error rate, so per-user counts often
say more than raw ones; and a failure rate is only meaningful against its own
start event, when that lifecycle is present in the data.
