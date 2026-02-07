#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "httpx==0.28.1",
# ]
# ///

from __future__ import annotations

import json
from datetime import datetime, timezone

import httpx

ASSETS_URL = "https://api.github.com/repos/thewh1teagle/vibe/releases"
PATTERNS = [".exe", ".dmg", ".deb", ".rpm"]
PATTERN_NAMES = {
    ".exe": "Windows",
    ".dmg": "macOS",
    ".deb": "Linux",
    ".rpm": "Linux",
}


def main() -> int:
    response = httpx.get(ASSETS_URL, follow_redirects=True, timeout=60)
    response.raise_for_status()
    releases = response.json()

    stats: dict[str, int | str] = {}
    for release in releases:
        for asset in release.get("assets", []):
            name = asset.get("name", "")
            download_count = asset.get("download_count", 0)
            kind = next((pattern for pattern in PATTERNS if pattern in name), None)
            pretty_kind = PATTERN_NAMES.get(kind)
            if kind and pretty_kind:
                stats[pretty_kind] = int(stats.get(pretty_kind, 0)) + int(download_count)

    total = sum(int(value) for value in stats.values() if isinstance(value, int))
    stats["Total Downloads"] = total

    now_utc = datetime.now(timezone.utc)
    stats["Date"] = f"{now_utc.month}/{now_utc.day}/{now_utc.year}"

    print(json.dumps(stats, indent=4))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
