#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# ///

from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path


def has_feature(name: str, args: list[str]) -> bool:
    return f"--{name}" in args or name in args


def run_cmd(*args: str) -> None:
    subprocess.run(args, check=True)


def main() -> int:
    original_cwd = Path.cwd()
    script_root = Path(__file__).resolve().parent
    tauri_dir = script_root.parent / "desktop" / "src-tauri"
    os.chdir(tauri_dir)
    cwd = Path.cwd()
    argv = sys.argv[1:]

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
