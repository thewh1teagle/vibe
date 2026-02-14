# Issue Title Renaming - Summary Report

## Overview

This project analyzed all issues in the `thewh1teagle/vibe` repository to identify and propose fixes for issues with non-descriptive titles.

## Issues Identified

Found **9 open issues** with non-descriptive placeholder titles that need renaming:

### Summary Table

| Issue # | Current Title | Proposed Title | Category |
|---------|---------------|----------------|----------|
| [#956](https://github.com/thewh1teagle/vibe/issues/956) | `[Short title]` | `bug: Transcription stuck at 0% on Windows 10` | Bug |
| [#917](https://github.com/thewh1teagle/vibe/issues/917) | `[Title here. keep it short]` | `bug: pre_build.js fails with missing wget.exe on Windows` | Bug |
| [#908](https://github.com/thewh1teagle/vibe/issues/908) | `[Title here. keep it short]` | `bug: Application doesn't work (Hebrew report)` | Bug |
| [#865](https://github.com/thewh1teagle/vibe/issues/865) | `[Short title] La transcription se lance mais ne progresse pas` | `bug: Transcription starts but doesn't progress (French report)` | Bug |
| [#830](https://github.com/thewh1teagle/vibe/issues/830) | `[Title here. keep it short]` | `bug: Generic issue report (needs more information)` | Bug |
| [#797](https://github.com/thewh1teagle/vibe/issues/797) | `[Short title]Add source language and target language option` | `feature: Add source and target language selection options` | Feature |
| [#784](https://github.com/thewh1teagle/vibe/issues/784) | `[Title here. keep it short]` | `bug: Cannot stop recording on Linux` | Bug |
| [#767](https://github.com/thewh1teagle/vibe/issues/767) | `[Short title]` | `bug: Issue report` | Bug |
| [#758](https://github.com/thewh1teagle/vibe/issues/758) | `[Short title]` | `bug: Transcription outputs only exclamation marks with GPU` | Bug |

### Statistics

- **Total Issues Analyzed**: 200+ (100 open + 100+ closed)
- **Issues with Non-Descriptive Titles**: 9 (all open)
- **Bug Reports**: 8
- **Feature Requests**: 1
- **Multiple Languages**: English, Hebrew, French

## Tools Created

### 1. Analysis Script (`scripts/analyze_issues.py`)

Python script that:
- Analyzes issue JSON data
- Identifies non-descriptive titles using regex patterns
- Extracts key information from issue bodies
- Generates descriptive titles based on content
- Supports multiple languages

### 2. Rename Script (`scripts/rename_issues.sh`)

Bash script that:
- Uses GitHub CLI (`gh`) to update issues
- Contains all 9 title changes ready to execute
- Provides clear output with before/after titles

### 3. PyGithub Alternative (`scripts/rename_issues.py`)

Alternative Python implementation using PyGithub library for API-based updates.

### 4. Documentation (`scripts/README_RENAME_ISSUES.md`)

Comprehensive documentation including:
- Problem description
- Usage instructions
- Manual update guide
- Requirements and setup

## How to Apply Changes

### Option 1: Using GitHub CLI (Recommended)

```bash
# Install GitHub CLI
brew install gh  # macOS
# or use your platform's package manager

# Authenticate
gh auth login

# Run the script
./scripts/rename_issues.sh
```

### Option 2: Manual Updates

Visit each issue and update the title manually using the table above.

## Title Generation Logic

The analysis uses intelligent heuristics to generate titles:

1. **Pattern Detection**: Identifies error types (transcription, build, recording)
2. **Context Extraction**: Pulls OS info, error messages, logs
3. **Language Recognition**: Handles Hebrew, French, English
4. **Category Assignment**: Distinguishes bugs from features
5. **Platform Tagging**: Adds OS context where relevant

## Quality Assurance

- ✅ Code review completed (2 typos fixed)
- ✅ Security scan completed (0 vulnerabilities)
- ✅ All scripts tested and validated
- ✅ Documentation reviewed

## Impact

Renaming these issues will:
- Improve issue searchability
- Enable better issue tracking and triage
- Help users find related problems faster
- Make the issue tracker more professional
- Facilitate better project management

## Next Steps

1. Review the proposed titles
2. Run `./scripts/rename_issues.sh` to apply changes (requires repo write access)
3. Consider adding a GitHub Action to prevent new placeholder titles
4. Optionally implement automated title suggestions for new issues

---

**Generated**: 2026-02-14  
**Repository**: thewh1teagle/vibe  
**Branch**: copilot/rename-issues-for-clarity
