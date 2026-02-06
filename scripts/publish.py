#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# ///

from __future__ import annotations

import glob
import json
import subprocess
import sys
from pathlib import Path

OWNER = "thewh1teagle"
REPO = "vibe"
TAURI_CONF_PATH = Path(__file__).resolve().parent.parent / "desktop/src-tauri/tauri.conf.json"


def publish(dst: str, tag: str) -> None:
    subprocess.run(["gh", "release", "upload", tag, dst, "--clobber"], check=True)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: uv run scripts/publish.py '<glob-pattern>'", file=sys.stderr)
        return 1

    config = json.loads(TAURI_CONF_PATH.read_text(encoding="utf-8"))
    tag = "v" + config["version"]
    dst = argv[1]

    for file_path in glob.glob(dst):
        publish(file_path, tag)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
