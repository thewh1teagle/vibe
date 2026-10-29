#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "httpx==0.28.1",
# ]
# ///

"""Point an update channel at a release. See docs/UPDATER.md.

    uv run scripts/channel.py 3.3.0 --channel beta
    uv run scripts/channel.py 3.3.0 --channel stable

Writes website/public/updater/<channel>.json from the release's own latest.json. Commit it to
main and the website deploy publishes it.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

CHANNELS_DIR = Path(__file__).resolve().parent.parent / "website/public/updater"
MANIFEST_URL = "https://github.com/thewh1teagle/vibe/releases/download/v{version}/latest.json"


def version_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split("-")[0].split("."))


def fetch_manifest(version: str) -> dict:
    response = httpx.get(MANIFEST_URL.format(version=version), follow_redirects=True, timeout=30)
    if response.status_code == 404:
        sys.exit(f"v{version} has no latest.json; did release.yml finish?")
    response.raise_for_status()
    manifest = response.json()
    if manifest.get("version") != version:
        sys.exit(f"v{version}'s latest.json says version {manifest.get('version')!r}")
    return manifest


def read_channel(channel: str) -> dict | None:
    path = CHANNELS_DIR / f"{channel}.json"
    return json.loads(path.read_text()) if path.exists() else None


def write_channel(channel: str, manifest: dict) -> None:
    CHANNELS_DIR.mkdir(parents=True, exist_ok=True)
    (CHANNELS_DIR / f"{channel}.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{channel}: v{manifest['version']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("version", help="release version, without the v")
    parser.add_argument("--channel", choices=["stable", "beta"], required=True)
    args = parser.parse_args()

    version = args.version.removeprefix("v")
    current = read_channel(args.channel)
    # The updater only moves forward, so an older version here would reach no one already past it.
    if current and version_key(version) < version_key(current["version"]):
        sys.exit(f"{args.channel} is on v{current['version']}; installs never go back to v{version}")

    manifest = fetch_manifest(version)
    write_channel(args.channel, manifest)

    # Beta is never behind stable: whatever stable gets, beta already has.
    beta = read_channel("beta")
    if args.channel == "stable" and (not beta or version_key(beta["version"]) < version_key(version)):
        write_channel("beta", manifest)

    print("Commit website/public/updater/ to main; the website deploy publishes it.")


if __name__ == "__main__":
    main()
