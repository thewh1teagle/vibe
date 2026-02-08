# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""
Extract and rank error events from Vibe analytics CSV exports.

Filters by date range, groups by error signature / OS / version,
and outputs a markdown report suitable for agent ingestion.

Usage:
    uv run scripts/analytics_errors.py vibe-release-2026-02-01.csv
    uv run scripts/analytics_errors.py vibe-release-2026-02-01.csv --hours 48
    uv run scripts/analytics_errors.py vibe-release-2026-02-01.csv --hours 48 --raw
"""

import argparse
import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone


def parse_timestamp(ts: str) -> datetime:
    return datetime.strptime(ts.strip(), "%Y-%m-%d %H:%M:%S").replace(
        tzinfo=timezone.utc
    )


def error_signature(msg: str) -> str:
    """Normalize an error message to a short signature (first meaningful line, max 120 chars)."""
    first_line = msg.strip().split("\n")[0].strip()
    if len(first_line) > 120:
        return first_line[:117] + "..."
    return first_line


def main():
    parser = argparse.ArgumentParser(
        description="Extract error events from Vibe analytics CSV"
    )
    parser.add_argument("csv_path", help="Path to the analytics CSV file")
    parser.add_argument(
        "--hours",
        type=int,
        default=720,
        help="Look back N hours (default: 720 ≈ 30 days)",
    )
    parser.add_argument(
        "--raw", action="store_true", help="Append raw error list for agent deep-dive"
    )
    args = parser.parse_args()

    cutoff = datetime.now(timezone.utc) - timedelta(hours=args.hours)

    # --- read & filter ---
    errors: list[dict] = []
    total_rows = 0
    with open(args.csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_rows += 1
            ts = parse_timestamp(row["timestamp"])
            if ts < cutoff:
                continue
            if "failed" not in row["event_name"]:
                continue
            props = json.loads(row["string_props"]) if row["string_props"] else {}
            errors.append(
                {
                    "timestamp": row["timestamp"].strip(),
                    "event": row["event_name"].strip(),
                    "error_message": props.get("error_message", ""),
                    "source": props.get("source", ""),
                    "os": row["os_name"].strip(),
                    "os_version": row["os_version"].strip(),
                    "app_version": row["app_version"].strip(),
                    "user_id": row["user_id"].strip(),
                    "country": row["country_name"].strip(),
                    "locale": row["locale"].strip(),
                }
            )

    if not errors:
        print(
            f"No error events found in the last {args.hours} hours ({total_rows} total rows scanned)."
        )
        sys.exit(0)

    # --- aggregate ---
    Key = tuple[str, str, str, str]  # (signature, event, os, app_version)
    groups: dict[Key, dict] = defaultdict(
        lambda: {"count": 0, "users": set(), "sample": "", "countries": set()}
    )

    for e in errors:
        sig = error_signature(e["error_message"]) if e["error_message"] else e["event"]
        key: Key = (sig, e["event"], e["os"], e["app_version"])
        g = groups[key]
        g["count"] += 1
        g["users"].add(e["user_id"])
        g["countries"].add(e["country"])
        if not g["sample"]:
            g["sample"] = e["error_message"][:300] if e["error_message"] else ""

    ranked = sorted(groups.items(), key=lambda x: x[1]["count"], reverse=True)

    unique_users = {e["user_id"] for e in errors}
    oldest = min(e["timestamp"] for e in errors)
    newest = max(e["timestamp"] for e in errors)

    # --- report ---
    print("# Vibe Analytics — Error Report\n")
    print(f"- **Date range:** {oldest} → {newest} (last {args.hours}h)")
    print(f"- **Total rows scanned:** {total_rows}")
    print(f"- **Error events:** {len(errors)}")
    print(f"- **Unique users affected:** {len(unique_users)}")
    print()

    print("## Top Errors\n")
    print("| # | Count | Users | OS | Version | Error Signature |")
    print("|---|-------|-------|----|---------|-----------------|")
    for i, (key, g) in enumerate(ranked, 1):
        sig, event, os_name, app_ver = key
        label = sig if sig != event else event
        print(
            f"| {i} | {g['count']} | {len(g['users'])} | {os_name} | {app_ver} | {label} |"
        )
    print()

    print("## Error Details\n")
    for i, (key, g) in enumerate(ranked, 1):
        sig, event, os_name, app_ver = key
        countries = ", ".join(sorted(g["countries"] - {""})) or "unknown"
        print(f"### {i}. {sig or event}\n")
        print(f"- **Event:** `{event}`")
        print(f"- **OS:** {os_name} {app_ver}")
        print(f"- **Occurrences:** {g['count']} ({len(g['users'])} unique users)")
        print(f"- **Countries:** {countries}")
        if g["sample"]:
            print("- **Sample:**")
            print("  ```")
            print(f"  {g['sample']}")
            print("  ```")
        print()

    if args.raw:
        print("## Raw Error List\n")
        print("| Timestamp | User | Event | OS | Version | Country | Error |")
        print("|-----------|------|-------|----|---------|---------|-------|")
        for e in errors:
            msg = (
                (e["error_message"][:80] + "...")
                if len(e["error_message"]) > 80
                else e["error_message"]
            )
            msg = msg.replace("\n", " ")
            print(
                f"| {e['timestamp']} | {e['user_id'][:8]}… | {e['event']} | {e['os']} | {e['app_version']} | {e['country']} | {msg} |"
            )


if __name__ == "__main__":
    main()
