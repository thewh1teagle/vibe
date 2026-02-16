#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "PyGithub==2.5.0",
#   "python-dotenv==1.0.1",
# ]
# ///

"""
Script to analyze GitHub issues with non-descriptive titles and generate better titles.

This script:
1. Fetches all issues from the repository
2. Identifies issues with non-descriptive titles (e.g., "[Short title]", "[Title here. keep it short]")
3. Analyzes issue content to generate descriptive and short titles
4. Optionally updates the issues with new titles (requires GITHUB_TOKEN with appropriate permissions)
"""

import os
import re
from typing import List, Dict, Tuple
from github import Github, Issue
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Patterns that indicate non-descriptive titles
NON_DESCRIPTIVE_PATTERNS = [
    r'^\[Short title\]',
    r'^\[Title here\.? keep it short\]',
    r'^\[.*?\]$',  # Any title that's just a placeholder in brackets
]

def is_non_descriptive_title(title: str) -> bool:
    """Check if a title matches non-descriptive patterns."""
    for pattern in NON_DESCRIPTIVE_PATTERNS:
        if re.search(pattern, title, re.IGNORECASE):
            return True
    return False

def extract_key_info_from_body(body: str) -> Dict[str, str]:
    """Extract key information from issue body."""
    if not body:
        return {}
    
    info = {}
    
    # Try to extract "What happened?" section
    what_happened_match = re.search(r'###\s*What happened\?\s*\n+(.*?)(?=\n###|\Z)', body, re.DOTALL | re.IGNORECASE)
    if what_happened_match:
        info['what_happened'] = what_happened_match.group(1).strip()
    
    # Try to extract OS information
    os_match = re.search(r'###\s*What OS.*?\n+(.*?)(?=\n###|\Z)', body, re.DOTALL | re.IGNORECASE)
    if os_match:
        info['os'] = os_match.group(1).strip()
    
    # Try to extract error/log information
    log_match = re.search(r'```(?:shell)?\s*(.*?)\s*```', body, re.DOTALL)
    if log_match:
        info['log'] = log_match.group(1).strip()
    
    return info

def generate_descriptive_title(issue: Issue.Issue) -> str:
    """Generate a descriptive title based on issue content."""
    body = issue.body or ""
    info = extract_key_info_from_body(body)
    
    # Start with a default
    new_title = "bug: Issue report"
    
    # Analyze the content to create a better title
    what_happened = info.get('what_happened', '').lower()
    log_output = info.get('log', '').lower()
    os_info = info.get('os', '').lower()
    
    # Check for specific error patterns
    if 'transcription' in what_happened or 'transcription' in log_output:
        if 'stuck' in what_happened or 'stuck' in log_output or '0%' in what_happened or '0%' in log_output:
            new_title = "bug: Transcription stuck at 0%"
            if 'windows 10' in os_info:
                new_title += " on Windows 10"
            elif 'windows 11' in os_info:
                new_title += " on Windows 11"
        elif 'ne progresse pas' in body.lower():
            new_title = "bug: Transcription starts but doesn't progress"
        else:
            new_title = "bug: Transcription fails"
    
    elif 'wget' in log_output or 'command not found: wget.exe' in log_output:
        new_title = "bug: pre_build.js fails with missing wget.exe on Windows"
    
    elif 'לא עובד' in what_happened or 'לא עובד' in log_output:
        # Hebrew for "doesn't work"
        new_title = "bug: Application doesn't work (Hebrew report)"
    
    elif 'a bug happened' in what_happened and len(what_happened) < 30:
        # Very generic report with no details
        new_title = "bug: Generic issue report (needs more information)"
    
    # If we couldn't determine a specific issue, try to extract first meaningful sentence
    if new_title == "bug: Issue report" and what_happened and what_happened != "a bug happened!":
        # Take first sentence, up to 60 characters
        first_sentence = what_happened.split('.')[0].split('!')[0].split('\n')[0]
        if len(first_sentence) > 60:
            first_sentence = first_sentence[:57] + "..."
        if first_sentence and first_sentence.lower() != "a bug happened":
            new_title = f"bug: {first_sentence}"
    
    return new_title

def analyze_issues(repo_name: str, dry_run: bool = True) -> List[Tuple[Issue.Issue, str]]:
    """Analyze issues in the repository and return issues that need renaming."""
    # Get GitHub token from environment
    token = os.getenv('GITHUB_TOKEN')
    if not token:
        print("Warning: GITHUB_TOKEN not found. Using unauthenticated access (limited rate).")
    
    # Initialize GitHub client
    g = Github(token) if token else Github()
    repo = g.get_repo(repo_name)
    
    # Get all issues (both open and closed)
    all_issues = list(repo.get_issues(state='all'))
    
    issues_to_rename = []
    
    print(f"Analyzing {len(all_issues)} issues in {repo_name}...")
    print()
    
    for issue in all_issues:
        if issue.pull_request:
            # Skip pull requests
            continue
        
        if is_non_descriptive_title(issue.title):
            new_title = generate_descriptive_title(issue)
            issues_to_rename.append((issue, new_title))
    
    return issues_to_rename

def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Analyze and rename GitHub issues with non-descriptive titles')
    parser.add_argument('--repo', default='thewh1teagle/vibe', help='Repository name (owner/repo)')
    parser.add_argument('--apply', action='store_true', help='Apply the changes (requires GITHUB_TOKEN with write access)')
    parser.add_argument('--dry-run', action='store_true', default=True, help='Only show what would be changed (default)')
    
    args = parser.parse_args()
    
    # Analyze issues
    issues_to_rename = analyze_issues(args.repo, dry_run=not args.apply)
    
    if not issues_to_rename:
        print(f"✓ No issues with non-descriptive titles found in {args.repo}")
        return
    
    print(f"Found {len(issues_to_rename)} issues with non-descriptive titles:\n")
    print("=" * 80)
    
    for issue, new_title in issues_to_rename:
        print(f"\nIssue #{issue.number}")
        print(f"  Current title: {issue.title}")
        print(f"  Proposed title: {new_title}")
        print(f"  URL: {issue.html_url}")
        print(f"  State: {issue.state}")
        
        if args.apply and not args.dry_run:
            # Apply the change
            try:
                issue.edit(title=new_title)
                print(f"  ✓ Updated!")
            except Exception as e:
                print(f"  ✗ Failed to update: {e}")
        else:
            print(f"  (dry-run mode - no changes applied)")
    
    print("\n" + "=" * 80)
    
    if not args.apply or args.dry_run:
        print(f"\nTo apply these changes, run with --apply flag and ensure GITHUB_TOKEN is set with write permissions.")
    else:
        print(f"\n✓ Successfully updated {len(issues_to_rename)} issue titles!")

if __name__ == '__main__':
    main()
