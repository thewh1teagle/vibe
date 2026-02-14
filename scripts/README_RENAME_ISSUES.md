# Issue Title Renaming Tool

This tool helps identify and rename GitHub issues with non-descriptive titles in the Vibe repository.

## Problem

Some issues are created with placeholder titles like:
- `[Short title]`
- `[Title here. keep it short]`
- `App reports bug` (auto-generated)
- `Bug:` (generic)
- Other generic placeholder text

These titles make it hard to:
- Quickly understand what the issue is about
- Search for related issues
- Track and triage bugs effectively

## Solution

This directory contains tools to:
1. Scan ALL issues in the repository (open and closed)
2. Intelligently analyze each issue's content
3. Generate descriptive titles based on issue body, errors, logs, etc.
4. Skip issues that already have descriptive titles
5. Apply the changes using GitHub CLI

## Files

- **`rename_all_issues_agentic.py`** - **NEW** Agentic script that analyzes ALL issues and renames non-descriptive ones
- **`apply_agentic_renames.sh`** - **NEW** Auto-generated shell script to apply 86 issue renames
- **`analyze_issues.py`** - Original Python script that analyzes issue JSON data
- **`rename_issues.sh`** - Original bash script for the first 9 issues
- **`rename_issues.py`** - Alternative Python script using PyGithub (requires API access)

## Quick Start - Agentic Renaming (Recommended)

**This will analyze ALL 200+ issues and rename 86 non-descriptive ones:**

1. Install GitHub CLI if not already installed:
   ```bash
   # macOS
   brew install gh
   
   # Linux
   sudo apt install gh  # Debian/Ubuntu
   sudo dnf install gh  # Fedora
   
   # Windows
   winget install --id GitHub.cli
   ```

2. Authenticate with GitHub:
   ```bash
   gh auth login
   ```

3. Run the agentic rename script:
   ```bash
   ./scripts/apply_agentic_renames.sh
   ```

This will:
- Analyze each issue's content (body, logs, errors, OS, etc.)
- Skip issues that already have descriptive titles
- Rename 86 issues with improved titles
- Work on both open and closed issues

## Alternative: Manual Analysis

### Option 1: Using GitHub CLI (Recommended)

1. Install GitHub CLI if not already installed:
   ```bash
   # macOS
   brew install gh
   
   # Linux
   sudo apt install gh  # Debian/Ubuntu
   sudo dnf install gh  # Fedora
   
   # Windows
   winget install --id GitHub.cli
   ```

2. Authenticate with GitHub:
   ```bash
   gh auth login
   ```

3. Run the rename script (original 9 issues):
   ```bash
   ./scripts/rename_issues.sh
   ```

### Option 2: Using Python Analysis Script

To analyze issues from JSON data:

```bash
# First, fetch issue data (this is already done for you in /tmp directory)
# Then analyze it:
python3 scripts/analyze_issues.py /path/to/issues.json
```

## How It Works

The agentic analysis script (`rename_all_issues_agentic.py`):

1. **Smart Title Detection**: Identifies non-descriptive titles using multiple heuristics:
   - `^\[Short title\]` - Placeholder brackets
   - `^\[Title here\.? keep it short\]` - Template text
   - `^Bug:?\s*$` - Just "Bug:" or "Bug"
   - `^App reports bug\s*$` - Generic auto-report
   - Titles that are too short and generic

2. **Content Analysis**: Extracts key information from issue bodies:
   - "What happened?" section
   - OS information
   - Error logs and output
   - Steps to reproduce
   - Language of the report

3. **Intelligent Title Generation**: Creates descriptive titles based on:
   - **Error Type**: Transcription, build, recording, download, etc.
   - **Platform**: Windows, macOS, Linux with version info
   - **Specific Errors**: FFmpeg, model download, GPU issues
   - **Features**: Diarization, export formats, models
   - **Language**: Handles English, Hebrew, French reports

4. **Selective Renaming**: Only renames issues that:
   - Have placeholder or generic titles
   - Can be improved with content-based analysis
   - Skips issues with already-descriptive titles

## Results - Agentic Analysis

Out of **200 total issues analyzed**:
- **114 issues** already have descriptive titles (skipped)
- **86 issues** need renaming:
  - 13 open issues
  - 73 closed issues

### Common Improvements

| Pattern | Count | Example Transformation |
|---------|-------|------------------------|
| "App reports bug" → Specific error | 73 | "App reports bug" → "bug: YouTube download fails" |
| "[Short title]" → Content-based | 5 | "[Short title]" → "bug: Transcription stuck at 0% on Windows 10" |
| "[Title here. keep it short]" → Analysis | 4 | "[Title here. keep it short]" → "bug: Cannot stop recording on Linux" |
| "Bug:" → Descriptive | 4 | "Bug:" → "bug: Issue report" |

## Issues Found and Proposed Changes

| Issue # | Current Title | Proposed Title | Status |
|---------|---------------|----------------|--------|
| [#956](https://github.com/thewh1teagle/vibe/issues/956) | `[Short title]` | `bug: Transcription stuck at 0% on Windows 10` | Open |
| [#917](https://github.com/thewh1teagle/vibe/issues/917) | `[Title here. keep it short]` | `bug: pre_build.js fails with missing wget.exe on Windows` | Open |
| [#908](https://github.com/thewh1teagle/vibe/issues/908) | `[Title here. keep it short]` | `bug: Application doesn't work (Hebrew report)` | Open |
| [#865](https://github.com/thewh1teagle/vibe/issues/865) | `[Short title] La transcription...` | `bug: Transcription starts but doesn't progress (French report)` | Open |
| [#830](https://github.com/thewh1teagle/vibe/issues/830) | `[Title here. keep it short]` | `bug: Generic issue report (needs more information)` | Open |
| [#797](https://github.com/thewh1teagle/vibe/issues/797) | `[Short title]Add source language...` | `feature: Add source and target language selection options` | Open |
| [#784](https://github.com/thewh1teagle/vibe/issues/784) | `[Title here. keep it short]` | `bug: Cannot stop recording on Linux` | Open |
| [#767](https://github.com/thewh1teagle/vibe/issues/767) | `[Short title]` | `bug: Issue report` | Open |
| [#758](https://github.com/thewh1teagle/vibe/issues/758) | `[Short title]` | `bug: Transcription outputs only exclamation marks with GPU` | Open |

**Total: 9 issues with non-descriptive titles found**

## Manual Update Instructions

If you prefer to update issues manually through the GitHub web interface:

1. Visit each issue URL from the table above
2. Click "Edit" next to the title
3. Replace with the proposed title
4. Save changes

## Requirements

- **For Shell Script**: GitHub CLI (`gh`) with authentication
- **For Python Script**: Python 3.12+
- No special permissions needed for analysis, write access needed for updates

## Notes

- The script uses heuristic-based analysis to generate titles
- Some issues may have insufficient content to generate a meaningful title
- Review suggested titles before applying changes
- The `rename_issues.sh` script can be edited to modify titles before running

## Future Improvements

- Use AI/LLM to generate more accurate titles based on issue content
- Add support for detecting duplicate issues based on content similarity
- Implement batch processing with confirmation prompts
- Add support for custom title templates
- Automate detection of new issues with placeholder titles
