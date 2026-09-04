# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "httpx==0.28.1",
# ]
# ///
"""
Windows code signing via remote YubiKey sign server.

Called by Tauri's custom signCommand for each binary.
Whitelists only installer + main exe, skips everything else.

Required env vars:
  SIGN_ENABLED       - set to "true" to actually sign (default: dry run)
  SIGN_TUNNEL_URL    - sign server URL (e.g. https://signing.example.com)
  SIGN_TUNNEL_SECRET - shared secret for auth

Usage:
  # Dry run (default):
  uv run scripts/sign_windows.py <file>

  # Real signing:
  SIGN_ENABLED=true uv run scripts/sign_windows.py <file>

  # Or in tauri.conf.json:
  "windows": {
    "signCommand": {
      "cmd": "python",
      "args": ["scripts/sign_windows.py", "%1"]
    }
  }

Verify signature:
  & "${env:ProgramFiles(x86)}\\Windows Kits\\10\\bin\\*\\x64\\signtool.exe" verify /pa /v <file>
"""
import fnmatch
import sys
import os

import httpx

# Whitelist patterns - only these get signed
# TODO: restore whitelist when patterns are finalized
# SIGN_PATTERNS = [
#     "vibe.exe",
#     "vibe*setup*.exe",
#     "vibe-server*.exe",
# ]
SIGN_PATTERNS = ["*"]


def sign(path: str) -> None:
    url = os.environ["SIGN_TUNNEL_URL"].rstrip("/")
    secret = os.environ["SIGN_TUNNEL_SECRET"]

    with open(path, "rb") as f:
        resp = httpx.post(
            f"{url}/sign",
            files={"file": (os.path.basename(path), f)},
            headers={"X-Tunnel-Secret": secret},
            timeout=120,
        )

    if resp.status_code != 200:
        print(f"[sign] ERROR: server returned {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)

    with open(path, "wb") as f:
        f.write(resp.content)


def main() -> None:
    path = sys.argv[1]
    basename = os.path.basename(path)

    if not any(fnmatch.fnmatch(basename.lower(), p) for p in SIGN_PATTERNS):
        print(f"[sign] SKIP: {basename}")
        sys.exit(0)

    dry_run = os.environ.get("SIGN_ENABLED", "").lower() != "true"
    if dry_run:
        print(f"[sign] DRY RUN: {basename} (set SIGN_ENABLED=true to sign)")
        sys.exit(0)

    missing = [v for v in ("SIGN_TUNNEL_URL", "SIGN_TUNNEL_SECRET") if not os.environ.get(v)]
    if missing:
        print(f"[sign] ERROR: missing env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    print(f"[sign] SIGNING: {basename}")
    sign(path)
    print(f"[sign] OK: {basename}")


if __name__ == "__main__":
    main()
