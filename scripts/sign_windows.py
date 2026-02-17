# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""
Windows code signing with SSL.com eSigner via Jsign.

Called by Tauri's custom signCommand for each binary.
Whitelists only installer + main exe, skips everything else.

Prerequisites:
  choco install jsign
  choco install temurin  # or any Java runtime

Required env vars:
  SIGN_ENABLED           - set to "true" to actually sign (default: dry run)
  SSL_COM_CREDENTIAL_ID  - eSigner credential ID
  SSL_COM_USERNAME       - SSL.com account email
  SSL_COM_PASSWORD       - SSL.com account password
  SSL_COM_TOTP_SECRET    - eSigner TOTP base32 secret

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
"""
import base64
import subprocess
import sys
import os
import re
import shutil

APP_NAME = "vibe"
TIMESTAMP_URL = "http://timestamp.sectigo.com"

# Whitelist patterns - only these get signed
SIGN_PATTERNS: list[re.Pattern[str]] = [
    # Main application executable
    re.compile(rf"^{re.escape(APP_NAME)}\.exe$", re.IGNORECASE),
    # NSIS installer
    re.compile(rf"^{re.escape(APP_NAME)}[-_].*setup.*\.exe$", re.IGNORECASE),
]


def find_jsign_jar() -> str:
    """Find jsign.jar from choco install or PATH."""
    # Chocolatey default location
    choco_path = r"C:\ProgramData\chocolatey\lib\jsign\tools\jsign.jar"
    if os.path.isfile(choco_path):
        return choco_path

    # Try to find jsign on PATH and look for jar nearby
    jsign_bin = shutil.which("jsign")
    if jsign_bin:
        jar = os.path.join(os.path.dirname(jsign_bin), "jsign.jar")
        if os.path.isfile(jar):
            return jar

    print("[sign] ERROR: jsign.jar not found", file=sys.stderr)
    sys.exit(1)


def sign(path: str) -> None:
    credential_id = os.environ["SSL_COM_CREDENTIAL_ID"]
    username = os.environ["SSL_COM_USERNAME"]
    password = os.environ["SSL_COM_PASSWORD"]
    totp_secret = os.environ["SSL_COM_TOTP_SECRET"]

    storepass = f"{username}|{password}"
    jsign_jar = find_jsign_jar()

    # Jsign expects the TOTP secret in base64, SSL.com gives it in base32
    padded = totp_secret + "=" * (-len(totp_secret) % 8)
    totp_secret_b64 = base64.b64encode(base64.b32decode(padded)).decode()

    subprocess.run(
        [
            "java", "-jar", jsign_jar, "sign",
            "--storetype", "ESIGNER",
            "--storepass", storepass,
            "--alias", credential_id,
            "--keypass", totp_secret_b64,
            "--tsaurl", TIMESTAMP_URL,
            path,
        ],
        check=True,
    )


def main() -> None:
    path = sys.argv[1]
    basename = os.path.basename(path)

    if not any(p.match(basename) for p in SIGN_PATTERNS):
        print(f"[sign] SKIP: {basename}")
        sys.exit(0)

    dry_run = os.environ.get("SIGN_ENABLED", "").lower() != "true"
    if dry_run:
        print(f"[sign] DRY RUN: {basename} (set SIGN_ENABLED=true to sign)")
        sys.exit(0)

    print(f"[sign] SIGNING: {basename}")
    sign(path)
    print(f"[sign] OK: {basename}")


if __name__ == "__main__":
    main()
