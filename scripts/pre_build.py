#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx"]
# ///

from __future__ import annotations

import io
import os
import platform
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

import httpx


# Archives with bundled ffmpeg for macOS/Windows, raw binary for Linux
SONA_ASSET_MAP = {
    "aarch64-apple-darwin": ("sona-darwin-arm64-with-ffmpeg.tar.gz", "sona", "ffmpeg"),
    "x86_64-apple-darwin": ("sona-darwin-amd64-with-ffmpeg.tar.gz", "sona", "ffmpeg"),
    "x86_64-unknown-linux-gnu": ("sona-linux-amd64", None, None),
    "aarch64-unknown-linux-gnu": ("sona-linux-arm64", None, None),
    "x86_64-pc-windows-msvc": ("sona-windows-amd64-with-ffmpeg.zip", "sona.exe", "ffmpeg.exe"),
}

# Raw sona-diarize binaries (no archive). Not available for x86_64-apple-darwin
# because ort lacks prebuilt ONNX Runtime binaries for that target.
DIARIZE_ASSET_MAP = {
    "aarch64-apple-darwin": "sona-diarize-darwin-arm64",
    "x86_64-unknown-linux-gnu": "sona-diarize-linux-amd64",
    "aarch64-unknown-linux-gnu": "sona-diarize-linux-arm64",
    "x86_64-pc-windows-msvc": "sona-diarize-windows-amd64.exe",
}

HOST_TRIPLE_MAP = {
    ("Darwin", "arm64"): "aarch64-apple-darwin",
    ("Darwin", "x86_64"): "x86_64-apple-darwin",
    ("Linux", "x86_64"): "x86_64-unknown-linux-gnu",
    ("Linux", "aarch64"): "aarch64-unknown-linux-gnu",
    ("Windows", "AMD64"): "x86_64-pc-windows-msvc",
}


def has_feature(name: str, args: list[str]) -> bool:
    return f"--{name}" in args or name in args


def run_cmd(*args: str) -> None:
    subprocess.run(args, check=True)


def parse_target_arg(args: list[str]) -> str | None:
    for i, arg in enumerate(args):
        if arg == "--target" and i + 1 < len(args):
            return args[i + 1]
    return None


def detect_host_target() -> str | None:
    return HOST_TRIPLE_MAP.get((platform.system(), platform.machine()))


def download_with_progress(client: httpx.Client, url: str, label: str) -> bytes:
    with client.stream("GET", url) as response:
        response.raise_for_status()
        total = int(response.headers.get("content-length", 0))
        downloaded = 0
        chunks: list[bytes] = []
        for chunk in response.iter_bytes():
            chunks.append(chunk)
            downloaded += len(chunk)
            if total:
                pct = downloaded * 100 // total
                print(f"\r  {label}: {pct}% ({downloaded // 1024 // 1024}MB / {total // 1024 // 1024}MB)", end="", flush=True)
        if total:
            print()
    return b"".join(chunks)


def download_sona(script_root: Path, target_triple: str | None) -> None:
    resolved_target = target_triple or detect_host_target()
    if not resolved_target:
        print(
            "Warning: Could not detect host Rust target triple. "
            "Pass --target <rust-target-triple> or place the binary manually in desktop/src-tauri/binaries/."
        )
        return

    asset_entry = SONA_ASSET_MAP.get(resolved_target)
    if not asset_entry:
        print(
            f"Warning: Unsupported target triple '{resolved_target}' for automatic sona download. "
            "Place the binary manually in desktop/src-tauri/binaries/."
        )
        return

    repo_root = script_root.parent
    version_file = repo_root / ".sona-version"
    try:
        tag = version_file.read_text(encoding="utf-8").strip()
    except OSError as exc:
        print(f"Warning: Unable to read {version_file}: {exc}")
        return

    if not tag:
        print(f"Warning: {version_file} is empty; skipping sona download.")
        return

    is_windows = resolved_target.endswith("windows-msvc")
    sona_sidecar = f"sona-{resolved_target}" + (".exe" if is_windows else "")
    binaries_dir = repo_root / "desktop" / "src-tauri" / "binaries"
    sona_dest = binaries_dir / sona_sidecar

    binaries_dir.mkdir(parents=True, exist_ok=True)
    asset_name, sona_member, ffmpeg_member = asset_entry
    ffmpeg_dest: Path | None = None
    if ffmpeg_member is not None:
        ffmpeg_sidecar = f"ffmpeg-{resolved_target}" + (".exe" if is_windows else "")
        ffmpeg_dest = binaries_dir / ffmpeg_sidecar

    if sona_dest.exists() and (ffmpeg_dest is None or ffmpeg_dest.exists()):
        print(f"Sona sidecar already exists at {sona_dest}; skipping download.")
        if ffmpeg_dest is not None:
            print(f"FFmpeg sidecar already exists at {ffmpeg_dest}; skipping download.")
        return

    url = f"https://github.com/thewh1teagle/sona/releases/download/{tag}/{asset_name}"

    try:
        with httpx.Client(follow_redirects=True, timeout=120) as client:
            data = download_with_progress(client, url, "sona")
    except Exception as exc:
        print(f"Warning: Failed to download sona from {url}: {exc}")
        print(f"Warning: You can manually place the sidecar at {sona_dest}")
        return

    if sona_member is None:
        # Raw binary (Linux) — no archive, no ffmpeg
        sona_dest.write_bytes(data)
        sona_dest.chmod(sona_dest.stat().st_mode | 0o111)
        print(f"Downloaded sona sidecar to {sona_dest}")
        return

    # Extract sona and ffmpeg from archive
    if ffmpeg_dest is None:
        raise RuntimeError(f"Expected ffmpeg sidecar path for target {resolved_target}")

    if asset_name.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for name in zf.namelist():
                basename = Path(name).name
                if basename == sona_member:
                    sona_dest.write_bytes(zf.read(name))
                elif basename == ffmpeg_member:
                    ffmpeg_dest.write_bytes(zf.read(name))
    else:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
            for member in tf.getmembers():
                basename = Path(member.name).name
                if basename == sona_member:
                    sona_dest.write_bytes(tf.extractfile(member).read())
                elif basename == ffmpeg_member:
                    ffmpeg_dest.write_bytes(tf.extractfile(member).read())

    for path in (sona_dest, ffmpeg_dest):
        if path.exists() and not path.name.endswith(".exe"):
            path.chmod(path.stat().st_mode | 0o111)

    print(f"Extracted sona sidecar to {sona_dest}")
    print(f"Extracted ffmpeg sidecar to {ffmpeg_dest}")


def download_diarize(script_root: Path, target_triple: str | None) -> None:
    resolved_target = target_triple or detect_host_target()
    if not resolved_target:
        return

    asset_name = DIARIZE_ASSET_MAP.get(resolved_target)
    if not asset_name:
        # Create a stub so Tauri can bundle externalBin without error
        is_windows = resolved_target.endswith("windows-msvc")
        sidecar = f"sona-diarize-{resolved_target}" + (".exe" if is_windows else "")
        binaries_dir = script_root.parent / "desktop" / "src-tauri" / "binaries"
        dest = binaries_dir / sidecar
        if not dest.exists():
            binaries_dir.mkdir(parents=True, exist_ok=True)
            if is_windows:
                dest.write_text("@echo off\necho sona-diarize is not supported on this platform\nexit /b 1\n")
            else:
                dest.write_text("#!/bin/sh\necho 'sona-diarize is not supported on this platform'\nexit 1\n")
                dest.chmod(dest.stat().st_mode | 0o111)
            print(f"Created sona-diarize stub at {dest} (not available for '{resolved_target}')")
        return

    repo_root = script_root.parent
    version_file = repo_root / ".sona-version"
    try:
        tag = version_file.read_text(encoding="utf-8").strip()
    except OSError:
        return

    if not tag:
        return

    is_windows = resolved_target.endswith("windows-msvc")
    sidecar = f"sona-diarize-{resolved_target}" + (".exe" if is_windows else "")
    binaries_dir = repo_root / "desktop" / "src-tauri" / "binaries"
    dest = binaries_dir / sidecar

    if dest.exists():
        print(f"sona-diarize sidecar already exists at {dest}; skipping download.")
        return

    binaries_dir.mkdir(parents=True, exist_ok=True)
    url = f"https://github.com/thewh1teagle/sona/releases/download/{tag}/{asset_name}"

    try:
        with httpx.Client(follow_redirects=True, timeout=120) as client:
            data = download_with_progress(client, url, "sona-diarize")
        dest.write_bytes(data)
        if not is_windows:
            dest.chmod(dest.stat().st_mode | 0o111)
        print(f"Downloaded sona-diarize sidecar to {dest}")
    except Exception as exc:
        print(f"Warning: Failed to download sona-diarize from {url}: {exc}")
        print("Diarization support will not be available in this build.")


def main() -> int:
    original_cwd = Path.cwd()
    script_root = Path(__file__).resolve().parent
    tauri_dir = script_root.parent / "desktop" / "src-tauri"
    os.chdir(tauri_dir)
    cwd = Path.cwd()
    argv = sys.argv[1:]
    target_triple = parse_target_arg(argv)
    download_sona(script_root, target_triple)
    download_diarize(script_root, target_triple)

    platform_map = {
        "Windows": "windows",
        "Darwin": "macos",
        "Linux": "linux",
    }
    current_platform = platform_map.get(platform.system())
    if not current_platform:
        raise RuntimeError(f"Unsupported platform: {platform.system()}")

    if current_platform == "linux":
        apt_packages = [
            "pkg-config",
            "build-essential",
            "libglib2.0-dev",
            "libgtk-3-dev",
            "libwebkit2gtk-4.1-dev",
            "clang",
            "cmake",
            "libasound2-dev",
            "libxdo-dev",
        ]
        run_cmd("sudo", "apt-get", "update")
        for pkg in apt_packages:
            run_cmd("sudo", "apt-get", "install", "-y", pkg)

    github_env = os.environ.get("GITHUB_ENV")

    if not github_env:
        print("\nCommands to build:")
        if original_cwd != cwd:
            relative_path = os.path.relpath(cwd.parent, original_cwd)
            print(f"cd {relative_path}")
        print("pnpm install")
        print("pnpm exec tauri build")

    if github_env and current_platform == "windows" and has_feature("portable", argv):
        print("Adding ENV WINDOWS_PORTABLE=1")
        with open(github_env, "a", encoding="utf-8") as file:
            file.write("WINDOWS_PORTABLE=1\n")

    action_arg = next((arg for arg in argv if "--dev" in arg or "--build" in arg), None)
    if action_arg:
        os.chdir(cwd.parent)

        run_cmd("pnpm", "install")
        run_cmd("pnpm", "exec", "tauri", "dev" if "--dev" in action_arg else "build")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
