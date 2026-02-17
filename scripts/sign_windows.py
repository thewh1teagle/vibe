# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""
Windows code signing script for Tauri's custom signCommand.

Usage in tauri.conf.json:
  "windows": {
    "signCommand": {
      "cmd": "uv",
      "args": ["run", "scripts/sign_windows.py", "%1"]
    }
  }

Tauri calls this for every binary it wants to sign.
We whitelist only the files that matter (installer + main app exe)
and skip everything else to stay under SSL.com OV signing limits.
"""
import sys
import os
import re

APP_NAME = "vibe"

# Whitelist patterns - only these get signed
SIGN_PATTERNS: list[re.Pattern[str]] = [
    # Main application executable
    re.compile(rf"^{re.escape(APP_NAME)}\.exe$", re.IGNORECASE),
    # NSIS installer
    re.compile(rf"^{re.escape(APP_NAME)}[-_].*setup.*\.exe$", re.IGNORECASE),
]

path = sys.argv[1]
basename = os.path.basename(path)

if not any(p.match(basename) for p in SIGN_PATTERNS):
    print(f"[sign] SKIP: {basename}")
    sys.exit(0)

print(f"[sign] SIGNING: {basename}")

# TODO: implement SSL.com OV signing
# Example with CodeSignTool:
# subprocess.run([
#     "CodeSignTool.bat", "sign",
#     "-credential_id", os.environ["SSL_COM_CREDENTIAL_ID"],
#     "-username", os.environ["SSL_COM_USERNAME"],
#     "-password", os.environ["SSL_COM_PASSWORD"],
#     "-totp_secret", os.environ["SSL_COM_TOTP_SECRET"],
#     "-input_file_path", path,
# ], check=True)
