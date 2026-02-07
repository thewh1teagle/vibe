#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "pyperclip==1.11.0",
# ]
# ///

from __future__ import annotations

import subprocess
import sys

import pyperclip


OLD_RELEASE_NOTES = """\
What's new? 🎉📣

- 🌍 Fix linux i18n (Thanks for @oleole39)
- ⏱️ Add option to transcribe word timestamps
- 🍏 Add macOS dmg installation background
- 💻 Set GPU preference to high performance on Windows by default
- 🔠 Max letters per sentence! (Thanks for @sdimantsd)
- 🎮 Choose GPU device (Thanks for @israelxss for the suggestion!)

**Full Changelog**: https://github.com/thewh1teagle/vibe/compare/v0.0.0...v0.0.1
"""


def run_text(*args: str) -> str:
    return subprocess.check_output(args, text=True).strip()


def build_prompt(messages: str, latest_two_tags: str) -> str:
    return f"""\
Old Release notes:
\"\"\"
{OLD_RELEASE_NOTES}
\"\"\"

Please write new one. based on the new commits.
Please keep only new features that important to simple users.
And add technical features only if they are critical.
Return it as snippet so I can copy it.
Commits are:
{messages}

Also, change the **full changelog** based on this tags: {latest_two_tags}
"""


def main() -> int:
    last_tag = run_text("git", "describe", "--tags", "--abbrev=0")
    last_tag_commit = run_text("git", "rev-list", "-n", "1", last_tag)
    messages = run_text("git", "log", "--oneline", f"{last_tag_commit}..HEAD")
    latest_two_tags = run_text("sh", "-c", "git tag --sort=-creatordate | head -n 2")

    prompt = build_prompt(messages=messages, latest_two_tags=latest_two_tags)
    print(prompt)

    try:
        pyperclip.copy(prompt)
    except pyperclip.PyperclipException:
        print("Could not copy to clipboard automatically.")
    else:
        print("Prompt copied to clipboard.")

    print("https://chat.openai.com/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
