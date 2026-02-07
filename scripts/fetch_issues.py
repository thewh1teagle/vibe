# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""
Fetch all open GitHub issues into github-issues/ folder as individual files.

Each file is named: {number}_{slugified_title}.md
Content includes issue number, title, URL, labels, and body.

Usage:
    uv run scripts/fetch_issues.py
    uv run scripts/fetch_issues.py --limit 20

Agent prompt for deduplication:
    Read ALL files in github-issues/. Find groups of duplicate issues that report
    the same bug or request the same feature. For each group, the leader is the
    oldest issue (lowest number). Close every duplicate using this exact format:

        gh issue close {number} -r "not planned" -c $'Duplicate of:\n- {leader_url}\n\n_Closed by AI agent — if this was closed in error, please re-open._'

    Note: use $'...' syntax (not "...") so that \n becomes a real newline.
    Only close issues you are VERY confident are duplicates — if unsure, skip.
    Work in batches: first read ALL files and list ALL duplicate groups in
    ISSUES-REPORT.md, then close them one by one updating the report as you go.
    Do NOT stop after one group — keep going until you have reviewed every file.
"""

import argparse
import json
import os
import re
import subprocess


def slugify(text: str, max_len: int = 60) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = text.strip("_")
    return text[:max_len].rstrip("_")


def fetch_issues(limit: int | None = None) -> list[dict]:
    cmd = [
        "gh", "issue", "list",
        "-s", "open",
        "--json", "number,title,body,labels,createdAt,url",
        "-L", str(limit or 500),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def write_issue(out_dir: str, issue: dict) -> str:
    number = issue["number"]
    title = issue.get("title", "untitled")
    slug = slugify(title)
    filename = f"{number}_{slug}.md"
    filepath = os.path.join(out_dir, filename)

    labels = ", ".join(l["name"] for l in issue.get("labels", []))
    body = issue.get("body") or "(no body)"

    content = f"""# #{number} - {title}

- **URL:** {issue.get('url', '')}
- **Created:** {issue.get('createdAt', '')}
- **Labels:** {labels or 'none'}

---

{body}
"""
    with open(filepath, "w") as f:
        f.write(content)
    return filename


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch GitHub issues into files")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of issues")
    parser.add_argument("--out", default="github-issues", help="Output directory")
    args = parser.parse_args()

    print(f"Fetching issues (limit={args.limit or 'all'})...")
    issues = fetch_issues(args.limit)
    print(f"Got {len(issues)} issues")

    os.makedirs(args.out, exist_ok=True)

    for issue in issues:
        filename = write_issue(args.out, issue)

    print(f"\nWrote {len(issues)} files to {args.out}/")


if __name__ == "__main__":
    main()
