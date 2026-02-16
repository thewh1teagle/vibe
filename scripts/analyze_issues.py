#!/usr/bin/env python3
"""
Script to identify GitHub issues with non-descriptive titles and generate better titles.

This script uses the already-fetched issue data to analyze and suggest new titles.
It outputs a report that can be used to manually update the issues.
"""

import json
import re
from typing import List, Dict, Tuple

# Patterns that indicate non-descriptive titles
NON_DESCRIPTIVE_PATTERNS = [
    r'^\[Short title\]',
    r'^\[Title here\.? keep it short\]',
]

def is_non_descriptive_title(title: str) -> bool:
    """Check if a title matches non-descriptive patterns."""
    # Also check for titles that start with placeholder brackets but might have additional text
    if re.search(r'^\[Short title\]', title, re.IGNORECASE):
        return True
    if re.search(r'^\[Title here\.? keep it short\]', title, re.IGNORECASE):
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

def generate_descriptive_title(issue: Dict) -> str:
    """Generate a descriptive title based on issue content."""
    body = issue.get('body', '') or ""
    current_title = issue.get('title', '')
    info = extract_key_info_from_body(body)
    
    # Start with a default
    new_title = "bug: Issue report"
    
    # Analyze the content to create a better title
    what_happened = info.get('what_happened', '').lower()
    log_output = info.get('log', '').lower()
    os_info = info.get('os', '').lower()
    
    # Check for feature requests or optimization suggestions
    if 'not a bug' in what_happened or 'optimization' in what_happened:
        if 'source language' in body.lower() and 'target language' in body.lower():
            new_title = "feature: Add source and target language selection options"
        elif 'gui' in what_happened.lower():
            new_title = "feature: GUI optimization suggestion"
        else:
            new_title = "feature: Feature request or improvement"
    
    # Check for recording issues
    elif "can't stop the recording" in body.lower() or "can&#39;t stop" in body.lower():
        if 'linux' in body.lower():
            new_title = "bug: Cannot stop recording on Linux"
        else:
            new_title = "bug: Cannot stop recording"
    
    # Check for specific error patterns
    elif 'transcription' in what_happened or 'transcription' in log_output or 'transcription' in body.lower():
        if '!!!!!!!!' in body or '&#34;!!!!!!!' in body:
            new_title = "bug: Transcription outputs only exclamation marks with GPU"
        elif 'stuck' in what_happened or 'stuck' in log_output or '0%' in what_happened or '0%' in log_output:
            new_title = "bug: Transcription stuck at 0%"
            if 'windows 10' in os_info or 'windows 10' in body.lower():
                new_title += " on Windows 10"
            elif 'windows 11' in os_info or 'windows 11' in body.lower():
                new_title += " on Windows 11"
        elif 'ne progresse pas' in body.lower():
            new_title = "bug: Transcription starts but doesn't progress"
        elif 'hangs at 0%' in log_output:
            new_title = "bug: Transcription hangs at 0% and app closes"
        else:
            new_title = "bug: Transcription fails"
    
    elif 'wget' in log_output or 'command not found: wget.exe' in log_output or 'wget.exe' in body:
        new_title = "bug: pre_build.js fails with missing wget.exe on Windows"
    
    elif 'pre_build.js' in body or 'prebuild' in body.lower():
        new_title = "bug: Build script fails"
    
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
    
    # If title has additional French text after placeholder, preserve some of it
    if '[Short title]' in current_title and 'La transcription' in current_title:
        new_title = "bug: Transcription starts but doesn't progress (French report)"
    
    return new_title

def main():
    """Main function."""
    # Read the issue data from the saved files
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python3 analyze_issues.py <issues_json_file>")
        print("\nThis script analyzes issue data to identify non-descriptive titles.")
        sys.exit(1)
    
    json_file = sys.argv[1]
    
    with open(json_file, 'r') as f:
        data = json.load(f)
    
    issues = data.get('issues', [])
    
    issues_to_rename = []
    
    print(f"Analyzing {len(issues)} issues...")
    print()
    
    for issue in issues:
        # Skip pull requests
        if 'pull_request' in issue:
            continue
        
        title = issue.get('title', '')
        if is_non_descriptive_title(title):
            new_title = generate_descriptive_title(issue)
            issues_to_rename.append((issue, new_title))
    
    if not issues_to_rename:
        print("✓ No issues with non-descriptive titles found")
        return
    
    print(f"Found {len(issues_to_rename)} issues with non-descriptive titles:\n")
    print("=" * 80)
    
    for issue, new_title in issues_to_rename:
        print(f"\nIssue #{issue['number']}")
        print(f"  Current title: {issue['title']}")
        print(f"  Proposed title: {new_title}")
        print(f"  URL: https://github.com/thewh1teagle/vibe/issues/{issue['number']}")
        print(f"  State: {issue['state']}")
        
        # Show a snippet of the issue body
        body = issue.get('body', '')
        if body:
            snippet = body[:200].replace('\n', ' ')
            if len(body) > 200:
                snippet += "..."
            print(f"  Content: {snippet}")
    
    print("\n" + "=" * 80)
    print(f"\nTotal issues to rename: {len(issues_to_rename)}")

if __name__ == '__main__':
    main()
