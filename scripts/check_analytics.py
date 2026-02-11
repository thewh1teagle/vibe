#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "pandas==2.2.3",
#     "tabulate==0.9.0",
# ]
# ///

"""
Analyze Aptabase analytics export for Vibe desktop app.

Events tracked in the app:

Rust side (desktop/src-tauri/src/analytics.rs):
  - app_started         : fired on every app launch (main.rs)
  - cli_started         : fired when CLI mode is used (cli.rs)
  - sona_spawn_failed   : fired when sona child process fails to spawn (cmd/mod.rs)
                          props: { error_message: string }

TypeScript side (desktop/src/lib/analytics.ts → invokes track_analytics_event):
  - transcribe_started   : fired when transcription begins (home + batch)
                           props: { source: "home"|"batch" }
  - transcribe_succeeded : fired on successful transcription
                           props: { source, duration_seconds, segments_count }
  - transcribe_failed    : fired on transcription failure
                           props: { source, error: string }

CSV exported via scripts/export_analytics.py from self-hosted Aptabase.

Codebase layout (for agents):
  - desktop/src-tauri/src/  : Rust backend (sona spawn, model load, analytics)
  - desktop/src/            : TypeScript frontend (transcribe UI, analytics events)
  - sona/                   : Go sona server source (whisper bindings, HTTP API, audio processing)
  - plans/                  : analysis reports and fix plans
"""

import json
import pandas as pd

CSV = "scripts/analytics_export.csv"

df = pd.read_csv(CSV)

# Parse JSON prop columns
def safe_json(val):
    if pd.isna(val):
        return {}
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return {}

df["_str_props"] = df["string_props"].apply(safe_json)
df["_num_props"] = df["numeric_props"].apply(safe_json)

print("=== Shape ===")
print(f"  rows: {len(df):,}  cols: {df.shape[1]}")
print()

print("=== Event distribution ===")
print(df["event_name"].value_counts().to_string())
print()

print("=== OS distribution ===")
print(df["os_name"].value_counts().to_string())
print()

print("=== Events x OS crosstab ===")
ct = pd.crosstab(df["event_name"], df["os_name"])
print(ct.to_string())
print()

# ── Transcribe failure rate by OS ──
started = df[df["event_name"] == "transcribe_started"].groupby("os_name").size()
failed = df[df["event_name"] == "transcribe_failed"].groupby("os_name").size()
succeeded = df[df["event_name"] == "transcribe_succeeded"].groupby("os_name").size()
rate = pd.DataFrame({"started": started, "failed": failed, "succeeded": succeeded}).fillna(0).astype(int)
rate["fail_rate_%"] = (rate["failed"] / rate["started"] * 100).round(1)
rate = rate.sort_values("started", ascending=False)
print("=== Transcribe failure rate by OS ===")
print(rate.to_string())
print()

# ── sona_spawn_failed details ──
spawn_fail = df[df["event_name"] == "sona_spawn_failed"].copy()
print(f"=== sona_spawn_failed: {len(spawn_fail)} events ===")
if len(spawn_fail):
    spawn_fail["error"] = spawn_fail["_str_props"].apply(lambda p: p.get("error_message", ""))
    print()
    print("--- By OS ---")
    print(spawn_fail["os_name"].value_counts().to_string())
    print()
    print("--- By OS + OS version ---")
    print(spawn_fail.groupby(["os_name", "os_version"]).size().sort_values(ascending=False).to_string())
    print()
    print("--- By app_version ---")
    print(spawn_fail["app_version"].value_counts().to_string())
    print()
    print("--- Error messages (top 15) ---")
    print(spawn_fail["error"].value_counts().head(15).to_string())
    print()
    print("--- Errors by OS (sample) ---")
    for os_name, group in spawn_fail.groupby("os_name"):
        print(f"\n  [{os_name}] ({len(group)} events)")
        for err, cnt in group["error"].value_counts().items():
            print(f"    ({cnt}x) {err[:200]}")
print()

# ── transcribe_failed details ──
tx_fail = df[df["event_name"] == "transcribe_failed"].copy()
print(f"=== transcribe_failed: {len(tx_fail)} events ===")
if len(tx_fail):
    tx_fail["error"] = tx_fail["_str_props"].apply(lambda p: p.get("error_message", p.get("error", "")))
    tx_fail["source"] = tx_fail["_str_props"].apply(lambda p: p.get("source", ""))
    print()
    print("--- By OS ---")
    print(tx_fail["os_name"].value_counts().to_string())
    print()
    print("--- By source ---")
    print(tx_fail["source"].value_counts().to_string())
    print()
    # Categorize errors
    def categorize_error(err: str) -> str:
        err_lower = err.lower()
        if "server is busy" in err_lower:
            return "server_busy"
        if "no model selected" in err_lower:
            return "no_model_selected"
        if "failed to load model" in err_lower:
            return "model_load_failed"
        if "failed to send load_model" in err_lower or "connect" in err_lower:
            return "sona_connection_failed"
        if "sona transcribe failed" in err_lower:
            return "sona_transcribe_error"
        if "eof while parsing" in err_lower:
            return "sona_spawn_eof"
        if not err.strip():
            return "empty_error"
        return "other"

    tx_fail["error_cat"] = tx_fail["error"].apply(categorize_error)

    print("--- Error categories ---")
    print(tx_fail["error_cat"].value_counts().to_string())
    print()

    print("--- Error categories x OS ---")
    ct2 = pd.crosstab(tx_fail["error_cat"], tx_fail["os_name"])
    print(ct2.to_string())
    print()

    print("--- Error messages (top 20, truncated) ---")
    for err, cnt in tx_fail["error"].value_counts().head(20).items():
        print(f"  ({cnt:>4}x) {err[:180]}")
    print()
    print("--- Errors by OS (top errors per OS) ---")
    for os_name, group in tx_fail.groupby("os_name"):
        print(f"\n  [{os_name}] ({len(group)} events)")
        for err, cnt in group["error"].value_counts().head(5).items():
            print(f"    ({cnt}x) {err[:180]}")
print()

# ── App version distribution ──
print("=== App version distribution ===")
print(df["app_version"].value_counts().to_string())
