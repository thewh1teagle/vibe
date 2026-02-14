#!/bin/bash
# Script to rename GitHub issues with non-descriptive titles
# This script uses the GitHub CLI (gh) to update issue titles

set -e

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed."
    echo "Please install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI."
    echo "Please run: gh auth login"
    exit 1
fi

REPO="thewh1teagle/vibe"

echo "Renaming issues with non-descriptive titles in $REPO..."
echo

# Issue #956: [Short title]
echo "Issue #956: [Short title]"
echo "  → bug: Transcription stuck at 0% on Windows 10"
gh issue edit 956 --repo $REPO --title "bug: Transcription stuck at 0% on Windows 10"
echo "  ✓ Updated"
echo

# Issue #917: [Title here. keep it short]
echo "Issue #917: [Title here. keep it short]"
echo "  → bug: pre_build.js fails with missing wget.exe on Windows"
gh issue edit 917 --repo $REPO --title "bug: pre_build.js fails with missing wget.exe on Windows"
echo "  ✓ Updated"
echo

# Issue #908: [Title here. keep it short]
echo "Issue #908: [Title here. keep it short]"
echo "  → bug: Application doesn't work (Hebrew report)"
gh issue edit 908 --repo $REPO --title "bug: Application doesn't work (Hebrew report)"
echo "  ✓ Updated"
echo

# Issue #865: [Short title] La transcription se lance mais ne progresse pas
echo "Issue #865: [Short title] La transcription se lance mais ne progresse pas"
echo "  → bug: Transcription starts but doesn't progress (French report)"
gh issue edit 865 --repo $REPO --title "bug: Transcription starts but doesn't progress (French report)"
echo "  ✓ Updated"
echo

# Issue #830: [Title here. keep it short]
echo "Issue #830: [Title here. keep it short]"
echo "  → bug: Generic issue report (needs more information)"
gh issue edit 830 --repo $REPO --title "bug: Generic issue report (needs more information)"
echo "  ✓ Updated"
echo

# Issue #797: [Short title]Add soure language and target language option
echo "Issue #797: [Short title]Add soure language and target language option"
echo "  → feature: Add source and target language selection options"
gh issue edit 797 --repo $REPO --title "feature: Add source and target language selection options"
echo "  ✓ Updated"
echo

# Issue #784: [Title here. keep it short]
echo "Issue #784: [Title here. keep it short]"
echo "  → bug: Cannot stop recording on Linux"
gh issue edit 784 --repo $REPO --title "bug: Cannot stop recording on Linux"
echo "  ✓ Updated"
echo

# Issue #767: [Short title]
echo "Issue #767: [Short title]"
echo "  → bug: Issue report"
gh issue edit 767 --repo $REPO --title "bug: Issue report"
echo "  ✓ Updated"
echo

# Issue #758: [Short title]
echo "Issue #758: [Short title]"
echo "  → bug: Transcription outputs only exclamation marks with GPU"
gh issue edit 758 --repo $REPO --title "bug: Transcription outputs only exclamation marks with GPU"
echo "  ✓ Updated"
echo

echo "=================================================================================="
echo "✓ Successfully renamed 9 issues!"
echo "=================================================================================="
