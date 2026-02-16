#!/usr/bin/env python3
"""
Agentic Issue Renaming Script

This script intelligently analyzes ALL issues (open and closed) in the repository,
determines if their titles are descriptive enough, and renames them based on content
if they're not.

Usage:
    python3 rename_all_issues_agentic.py --repo thewh1teagle/vibe [--dry-run] [--apply]
"""

import os
import sys
import json
import re
import argparse
from typing import Dict, List, Tuple, Optional

# Constants for title generation
MAX_SENTENCE_LENGTH = 60
TRUNCATION_LENGTH = 57
MIN_BODY_LENGTH = 50
MIN_TITLE_LENGTH = 10

def is_title_descriptive(title: str, body: str) -> bool:
    """
    Determine if a title is already descriptive enough.
    Returns False if title needs improvement.
    """
    # Check for obvious placeholder patterns
    placeholder_patterns = [
        r'^\[Short title\]',
        r'^\[Title here\.?\s*keep it short\]',
        r'^Bug:?\s*$',  # Just "Bug:" or "Bug"
        r'^App reports bug\s*$',  # Generic auto-report
        r'^\[.*?\]\s*$',  # Just brackets with content
    ]
    
    for pattern in placeholder_patterns:
        if re.search(pattern, title, re.IGNORECASE):
            return False
    
    # Title is too short and generic
    if len(title.strip()) < MIN_TITLE_LENGTH and any(word in title.lower() for word in ['bug', 'issue', 'error', 'problem']):
        return False
    
    # Check if title is just "App reports bug" or similar
    if title.strip().lower() in ['app reports bug', 'bug', 'issue', 'error']:
        return False
    
    # Title seems descriptive enough
    return True

def extract_info_from_body(body: str) -> Dict[str, str]:
    """Extract key information from issue body."""
    if not body:
        return {}
    
    info = {}
    
    # Extract "What happened?" section
    what_happened = re.search(r'###\s*What happened\?\s*\n+(.*?)(?=\n###|\Z)', body, re.DOTALL | re.IGNORECASE)
    if what_happened:
        info['what_happened'] = what_happened.group(1).strip()
    
    # Extract OS information
    os_match = re.search(r'###\s*What OS.*?\n+(.*?)(?=\n###|\Z)', body, re.DOTALL | re.IGNORECASE)
    if os_match:
        info['os'] = os_match.group(1).strip()
    
    # Extract log/error output
    log_match = re.search(r'```(?:shell|log|text)?\s*(.*?)\s*```', body, re.DOTALL)
    if log_match:
        info['log'] = log_match.group(1).strip()
    
    # Extract steps to reproduce
    steps_match = re.search(r'###\s*Steps to reproduce\s*\n+(.*?)(?=\n###|\Z)', body, re.DOTALL | re.IGNORECASE)
    if steps_match:
        info['steps'] = steps_match.group(1).strip()
    
    return info

def generate_descriptive_title(issue: Dict, current_title: str) -> Optional[str]:
    """
    Generate a descriptive title based on issue content.
    Returns None if current title is already good enough.
    """
    body = issue.get('body', '') or ""
    number = issue.get('number', 0)
    
    # Check if current title is descriptive
    if is_title_descriptive(current_title, body):
        return None  # Title is already good
    
    info = extract_info_from_body(body)
    what_happened = info.get('what_happened', '').lower()
    log_output = info.get('log', '').lower()
    os_info = info.get('os', '').lower()
    body_lower = body.lower()
    
    new_title = None
    
    # Feature requests / enhancements
    if 'not a bug' in what_happened or 'optimization' in what_happened or 'enhancement' in body_lower:
        if 'source language' in body_lower and 'target language' in body_lower:
            new_title = "feature: Add source and target language selection options"
        elif 'default export folder' in body_lower:
            new_title = "feature: Add default export folder setting"
        elif 'lrc file' in body_lower:
            new_title = "feature: Add LRC file output support"
        elif 'parakeet' in body_lower:
            new_title = "feature: Add Parakeet V3 model support"
        elif 'm4b' in body_lower:
            new_title = "feature: Add .m4b extension support"
        elif 'ai pass' in body_lower and 'context' in body_lower:
            new_title = "feature: Add AI context-aware word selection"
    
    # Recording issues
    if not new_title:
        if "can't stop" in body_lower or "can&#39;t stop" in body_lower or "stop the recording" in body_lower:
            if 'linux' in body_lower:
                new_title = "bug: Cannot stop recording on Linux"
            else:
                new_title = "bug: Cannot stop recording"
        elif 'microphone recording' in body_lower and 'stopped' in body_lower:
            new_title = "bug: Microphone recordings stopped in the middle"
        elif 'temp recording' in body_lower:
            new_title = "feature: Move temp recordings to Vibe-specific folder"
    
    # Transcription issues
    if not new_title and ('transcription' in body_lower or 'transcribe' in body_lower):
        if 'stuck' in body_lower or '0%' in body or 'hangs at 0%' in body_lower:
            new_title = "bug: Transcription stuck at 0%"
            if 'windows 10' in os_info or 'windows 10' in body_lower:
                new_title += " on Windows 10"
            elif 'windows 11' in os_info or 'windows 11' in body_lower:
                new_title += " on Windows 11"
        elif '!!!!' in body or '&#34;!!!!' in body:
            new_title = "bug: Transcription outputs only exclamation marks with GPU"
        elif "couldn't transcribe" in body_lower or "can't transcribe" in body_lower:
            new_title = "bug: Cannot transcribe file"
        elif 'ne progresse pas' in body_lower:
            new_title = "bug: Transcription starts but doesn't progress"
        elif 'song' in body_lower and "won't transcribe" in body_lower:
            new_title = "bug: Song file won't transcribe"
        elif 'crashes' in body_lower or 'crashing' in body_lower:
            new_title = "bug: App crashes when transcription starts"
        elif 'auto detect' in body_lower and 'no results' in body_lower:
            new_title = "bug: Auto Detect language produces no results"
        elif 'youtube' in body_lower or 'url' in body_lower:
            new_title = "bug: YouTube/URL download fails"
    
    # Diarization issues
    if not new_title and 'diarization' in body_lower:
        if 'windows 11' in body_lower:
            new_title = "bug: Diarization doesn't work on Windows 11"
        elif 'youtube' in body_lower:
            new_title = "bug: Diarization doesn't work for YouTube downloads"
        elif 'macos' in body_lower:
            new_title = "bug: Diarization fails on macOS"
        else:
            new_title = "bug: Diarization feature not working"
    
    # Download/update issues
    if not new_title:
        if 'model download' in body_lower:
            if 'disk is full' in body_lower:
                new_title = "bug: Model download fails when disk is full"
            else:
                new_title = "bug: Model download fails"
        elif 'youtube' in body_lower and 'download' in body_lower:
            if '100%' in body:
                new_title = "bug: YouTube download stops at 100%"
            else:
                new_title = "bug: YouTube download fails"
        elif 'sona.exe' in body_lower and 'updating' in body_lower:
            new_title = "bug: Error updating sona.exe"
        elif 'sona' in body_lower and 'loading' in body_lower:
            new_title = "bug: Sona model loading fails on Windows"
        elif 'winget' in body_lower:
            new_title = "bug: Winget updates missing"
    
    # Build/conversion issues
    if not new_title:
        if 'wget' in log_output or 'wget.exe' in body_lower:
            new_title = "bug: Build fails with missing wget.exe on Windows"
        elif 'ffmpeg' in body_lower:
            if 'pdf' in body_lower:
                new_title = "bug: FFmpeg conversion fails with PDF input"
            elif 'libbluray' in body_lower:
                new_title = "bug: FFmpeg conversion fails due to missing libbluray"
            elif 'mp3' in body_lower:
                new_title = "bug: MP3 transcription fails on macOS"
            else:
                new_title = "bug: Audio conversion fails in FFmpeg"
        elif 'pdf export' in body_lower:
            new_title = "bug: PDF export only saves first page"
    
    # Performance/hardware issues
    if not new_title:
        if 'performance' in body_lower and 'v3.0.12' in body:
            new_title = "bug: Performance degradation in v3.0.12"
        elif 'nvidia' in body_lower and 'hybrid gpu' in body_lower:
            new_title = "bug: App doesn't select Nvidia GPU on hybrid systems"
        elif 'core ml' in body_lower and 'timeout' in body_lower:
            new_title = "bug: macOS transcription fails with Core ML GPU timeout"
        elif 'global dictation' in body_lower:
            new_title = "bug: Global Dictation not working on Windows 11"
    
    # UI issues
    if not new_title:
        if 'rtl' in body_lower and 'toggle button' in body_lower:
            new_title = "bug: Toggle button moves out of bounds in RTL mode"
        elif 'json' in body_lower and 'start' in body_lower and 'stop times' in body_lower:
            new_title = "bug: Incorrect start/stop times in JSON export"
    
    # Other specific issues
    if not new_title:
        if 'srt output' in body_lower and 'negative' in body_lower:
            new_title = "bug: SRT output contains negative subtitle durations"
        elif 'speaker label' in body_lower and 'replace all' in body_lower:
            new_title = "bug: Replace all for speaker labels doesn't work"
        elif 'yt-dlp' in body_lower and 'outdated' in body_lower:
            new_title = "feature: Update yt-dlp to latest version"
        elif 'localhost' in body_lower and 'access denied' in body_lower:
            new_title = "bug: Access denied on localhost ports"
        elif 're-architect' in body_lower:
            new_title = "discussion: Re-architecting Vibe"
    
    # Generic patterns based on content
    if not new_title:
        # Hebrew content
        if 'לא עובד' in body or 'לא עובד' in what_happened:
            new_title = "bug: Application doesn't work (Hebrew report)"
        # French content
        elif any(french in body_lower for french in ['ne fonctionne pas', 'ne progresse pas', 'bonjour']):
            new_title = "bug: Issue report (French)"
        # Check if there's meaningful content in "what happened"
        elif what_happened and what_happened != "a bug happened!" and len(what_happened) > 20:
            # Extract first meaningful sentence
            first_sentence = what_happened.split('.')[0].split('!')[0].split('\n')[0]
            if len(first_sentence) > MAX_SENTENCE_LENGTH:
                first_sentence = first_sentence[:TRUNCATION_LENGTH] + "..."
            if first_sentence.lower() not in ['a bug happened', 'a bug']:
                new_title = f"bug: {first_sentence}"
    
    # Last resort for truly empty/generic reports
    if not new_title:
        if not body or len(body.strip()) < MIN_BODY_LENGTH:
            new_title = "bug: Generic issue report (needs more information)"
        elif 'crash' in body_lower or 'closes' in body_lower:
            new_title = "bug: Application crashes"
        elif "doesn't work" in body_lower or "not working" in body_lower:
            new_title = "bug: Feature not working"
        else:
            new_title = "bug: Issue report"
    
    return new_title

def main():
    parser = argparse.ArgumentParser(description='Agentically rename GitHub issues')
    parser.add_argument('--repo', default='thewh1teagle/vibe', help='Repository (owner/repo)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would change without applying')
    parser.add_argument('--apply', action='store_true', help='Actually apply the changes')
    parser.add_argument('--input-open', help='Path to JSON file with open issues')
    parser.add_argument('--input-closed', help='Path to JSON file with closed issues')
    
    args = parser.parse_args()
    
    if not args.input_open or not args.input_closed:
        print("Error: --input-open and --input-closed are required")
        print("Usage: python3 rename_all_issues_agentic.py --input-open /tmp/open.txt --input-closed /tmp/closed.txt [--dry-run|--apply]")
        sys.exit(1)
    
    # Load issues
    with open(args.input_open, 'r') as f:
        open_data = json.load(f)
    with open(args.input_closed, 'r') as f:
        closed_data = json.load(f)
    
    all_issues = open_data.get('issues', []) + closed_data.get('issues', [])
    
    print(f"Analyzing {len(all_issues)} issues...\n")
    
    issues_to_rename = []
    issues_skipped = []
    
    for issue in all_issues:
        if 'pull_request' in issue:
            continue
        
        current_title = issue.get('title', '')
        new_title = generate_descriptive_title(issue, current_title)
        
        if new_title and new_title != current_title:
            issues_to_rename.append((issue, current_title, new_title))
        else:
            issues_skipped.append(issue.get('number'))
    
    print(f"✓ Analyzed {len(all_issues)} issues")
    print(f"  - {len(issues_to_rename)} need renaming")
    print(f"  - {len(issues_skipped)} have descriptive titles (skipped)")
    print()
    
    if not issues_to_rename:
        print("All issues have descriptive titles!")
        return
    
    print("=" * 80)
    print(f"Issues to rename ({len(issues_to_rename)}):")
    print("=" * 80)
    
    for issue, old_title, new_title in issues_to_rename:
        print(f"\nIssue #{issue['number']} ({issue['state']})")
        print(f"  Current: {old_title}")
        print(f"  New:     {new_title}")
        print(f"  URL:     https://github.com/{args.repo}/issues/{issue['number']}")
    
    print("\n" + "=" * 80)
    
    if args.apply:
        print("\nApplying changes using GitHub CLI...")
        print("Note: This requires 'gh' CLI to be installed and authenticated.\n")
        
        import subprocess
        success_count = 0
        fail_count = 0
        
        for issue, old_title, new_title in issues_to_rename:
            try:
                result = subprocess.run(
                    ['gh', 'issue', 'edit', str(issue['number']), '--repo', args.repo, '--title', new_title],
                    capture_output=True,
                    text=True,
                    check=True
                )
                print(f"✓ Renamed #{issue['number']}")
                success_count += 1
            except subprocess.CalledProcessError as e:
                print(f"✗ Failed to rename #{issue['number']}: {e.stderr}")
                fail_count += 1
            except FileNotFoundError:
                print("\n✗ Error: GitHub CLI (gh) not found. Please install it:")
                print("  https://cli.github.com/")
                sys.exit(1)
        
        print(f"\n✓ Renamed {success_count} issues")
        if fail_count > 0:
            print(f"✗ Failed to rename {fail_count} issues")
    else:
        print("\nDry-run mode. Use --apply to actually rename these issues.")
        print("Command: python3 rename_all_issues_agentic.py --input-open ... --input-closed ... --apply")

if __name__ == '__main__':
    main()
