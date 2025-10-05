#!/usr/bin/env python3
"""
Setup script for faster-whisper Python environment.
Installs faster-whisper and dependencies.
"""
import subprocess
import sys

def install_faster_whisper():
    try:
        print("Installing faster-whisper...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "faster-whisper"])
        print("faster-whisper installed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Failed to install faster-whisper: {e}")
        sys.exit(1)

if __name__ == "__main__":
    install_faster_whisper()
