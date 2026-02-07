#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx"]
# ///

from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path

import httpx


SONA_TARGET_MAP = {
    "aarch64-apple-darwin": "sona-darwin-arm64",
    "x86_64-apple-darwin": "sona-darwin-amd64",
    "x86_64-unknown-linux-gnu": "sona-linux-amd64",
    "aarch64-unknown-linux-gnu": "sona-linux-arm64",
    "x86_64-pc-windows-msvc": "sona-windows-amd64.exe",
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


def download_sona(script_root: Path, target_triple: str | None) -> None:
    resolved_target = target_triple or detect_host_target()
    if not resolved_target:
        print(
            "Warning: Could not detect host Rust target triple. "
            "Pass --target <rust-target-triple> or place the binary manually in desktop/src-tauri/binaries/."
        )
        return

    asset_name = SONA_TARGET_MAP.get(resolved_target)
    if not asset_name:
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

    sidecar_name = f"sona-{resolved_target}"
    if resolved_target.endswith("windows-msvc"):
        sidecar_name += ".exe"

    destination = repo_root / "desktop" / "src-tauri" / "binaries" / sidecar_name
    if destination.exists():
        print(f"Sona sidecar already exists at {destination}; skipping download.")
        return

    destination.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://github.com/thewh1teagle/sona/releases/download/{tag}/{asset_name}"

    try:
        with httpx.Client(follow_redirects=True, timeout=60) as client:
            response = client.get(url)
            response.raise_for_status()
        destination.write_bytes(response.content)
        if not sidecar_name.endswith(".exe"):
            destination.chmod(destination.stat().st_mode | 0o111)
        print(f"Downloaded sona sidecar to {destination}")
    except Exception as exc:
        print(f"Warning: Failed to download sona sidecar from {url}: {exc}")
        print(
            "Warning: You can manually place the sidecar at "
            f"{destination}"
        )


def main() -> int:
    original_cwd = Path.cwd()
    script_root = Path(__file__).resolve().parent
    tauri_dir = script_root.parent / "desktop" / "src-tauri"
    os.chdir(tauri_dir)
    cwd = Path.cwd()
    argv = sys.argv[1:]
    target_triple = parse_target_arg(argv)
    download_sona(script_root, target_triple)

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
        print("bun install")
        if current_platform == "windows":
            print(r'$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"')
            print(r'$env:PATH += ";C:\Program Files\CMake\bin"')
            if has_feature("portable", argv):
                print("$env:WINDOWS_PORTABLE=1")
        print("bunx tauri build")

    if github_env and current_platform == "windows" and has_feature("portable", argv):
        print("Adding ENV WINDOWS_PORTABLE=1")
        with open(github_env, "a", encoding="utf-8") as file:
            file.write("WINDOWS_PORTABLE=1\n")

    action_arg = next((arg for arg in argv if "--dev" in arg or "--build" in arg), None)
    if action_arg:
        os.chdir(cwd.parent)
        if current_platform == "windows":
            os.environ["LIBCLANG_PATH"] = os.environ.get("LIBCLANG_PATH", r"C:\Program Files\LLVM\bin")
            os.environ["PATH"] = f'{os.environ.get("PATH", "")};C:\\Program Files\\CMake\\bin'
            if has_feature("portable", argv):
                os.environ["WINDOWS_PORTABLE"] = "1"

        run_cmd("bun", "install")
        run_cmd("bunx", "tauri", "dev" if "--dev" in action_arg else "build")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
