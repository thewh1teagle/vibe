#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# ///

from __future__ import annotations

import shutil
import subprocess
import sys


def run_text(*args: str) -> str:
    return subprocess.check_output(args, text=True).strip()


def copy_to_clipboard(text: str) -> bool:
    if shutil.which("pbcopy"):
        subprocess.run(["pbcopy"], input=text, text=True, check=True)
        return True
    if shutil.which("clip"):
        subprocess.run(["clip"], input=text, text=True, check=True)
        return True
    if shutil.which("wl-copy"):
        subprocess.run(["wl-copy"], input=text, text=True, check=True)
        return True
    if shutil.which("xclip"):
        subprocess.run(["xclip", "-selection", "clipboard"], input=text, text=True, check=True)
        return True
    return False


def main() -> int:
    git_info = run_text("git", "describe", "--tags", "--abbrev=0")
    last_tag_commit = run_text("git", "rev-list", "-n", "1", git_info.strip())
    current = run_text("git", "rev-parse", "HEAD")
    messages = run_text("git", "log", "--oneline", f"{last_tag_commit}..{current}")
    latest_two_tags = run_text("sh", "-c", "git tag --sort=-creatordate | head -n 2")

    prompt = f'''\
Old Release notes:
"""
What's new? 🎉📣

- 🌍 Fix linux i18n (Thanks for @oleole39)
- ⏱️ Add option to transcribe word timestamps
- 🍏 Add macOS dmg installation background
- 💻 Set GPU preference to high performance on Windows by default
- 🔠 Max letters per sentence! (Thanks for @sdimantsd)
- 🎮 Choose GPU device (Thanks for @israelxss for the suggestion!)

**Full Changelog**: https://github.com/thewh1teagle/vibe/compare/v0.0.0...v0.0.1
"""

Please write new one. based on the new commits.
Please keep only new features that important to simple users.
And add technical features only if they are critical.
Return it as snippet so I can copy it.
Commits are:
{messages}

Also, change the **full changelog** based on this tags: {latest_two_tags}
'''
    print(prompt)

    try:
        copied = copy_to_clipboard(prompt)
    except subprocess.SubprocessError:
        copied = False

    if copied:
        print("Prompt in your clipboard")
    else:
        print("Clipboard utility not found; prompt was printed only.")
    print("https://chat.openai.com/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
