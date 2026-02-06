#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "httpx==0.28.1",
# ]
# ///

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import httpx

RELEASES_PATH = Path(__file__).resolve().parent.parent / "landing/src/lib/latest_release.json"
OWNER = "thewh1teagle"
REPO = "vibe"
BLACKLIST_PATTERNS = ["opencl", "nvidia", "older", ".rpm", "portable", "cuda", "ubuntu", "setup_", "arm64-setup"]
VALID_EXTENSION_RE = re.compile(r"\.(sig|json|zip|tar\.gz)$")


def get_asset_info(name: str) -> dict[str, str]:
    platform_map = {
        ".deb": {"platform": "Linux", "arch": "darwin-aarch64" if "aarch64" in name else "linux-x86_64"},
        ".exe": {"platform": "Windows", "arch": "windows-x86_64" if "x64-setup" in name else "unknown"},
        ".dmg": {"platform": "MacOS", "arch": "darwin-aarch64" if "aarch64" in name else "darwin-x86_64"},
    }

    extension = next((ext for ext in platform_map if ext in name), "unknown")
    return platform_map.get(extension, {})


def filter_valid_assets(assets: list[dict]) -> list[dict]:
    return [
        asset
        for asset in assets
        if not VALID_EXTENSION_RE.search(asset.get("name", ""))
        and not any(pattern in asset.get("name", "") for pattern in BLACKLIST_PATTERNS)
    ]


def map_assets(assets: list[dict]) -> list[dict]:
    out: list[dict] = []
    for asset in assets:
        info = get_asset_info(asset.get("name", ""))
        out.append(
            {
                "url": asset.get("browser_download_url"),
                "name": asset.get("name"),
                **info,
            }
        )
    return out


def fetch_latest_release() -> dict:
    headers: dict[str, str] = {}
    gh_token = os.getenv("GH_TOKEN")
    if gh_token:
        headers["Authorization"] = f"Bearer {gh_token}"

    try:
        response = httpx.get(
            f"https://api.github.com/repos/{OWNER}/{REPO}/releases/latest",
            headers=headers,
            follow_redirects=True,
            timeout=60,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text
        raise RuntimeError(
            f"Failed to fetch latest release. Status: {exc.response.status_code} URL: {exc.request.url} Body: {body}"
        ) from exc


def main() -> int:
    try:
        latest_release = fetch_latest_release()
        tag_name = latest_release["tag_name"]
        valid_assets = filter_valid_assets(latest_release.get("assets", []))
        mapped_assets = map_assets(valid_assets)
        releases_data = {"assets": mapped_assets, "version": tag_name}
        RELEASES_PATH.write_text(json.dumps(releases_data, indent=4), encoding="utf-8")
        print(f"Updated releases at {RELEASES_PATH} with \n{json.dumps(releases_data, indent=4)}")
        return 0
    except Exception as exc:
        print(f"Error fetching or processing latest release: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
