#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "==> Installing JS dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "==> Downloading sona/ffmpeg binaries..."
uv run scripts/pre_build.py

echo "==> Building Vibe (release)..."
cd desktop
pnpm tauri build 2>&1 | tail -20

RPM=$(find src-tauri/target/release/bundle/rpm -name '*.rpm' -print -quit 2>/dev/null)

if [ -z "$RPM" ]; then
    echo "ERROR: No RPM found in src-tauri/target/release/bundle/rpm/"
    exit 1
fi

echo "==> Installing $RPM..."
sudo rpm -U --force "$RPM"

echo "==> Done! Vibe has been updated."
echo "   Restart the app to use the new version."
