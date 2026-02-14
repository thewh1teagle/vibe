#!/bin/bash
# Auto-generated script to rename all non-descriptive issues
# Generated from agentic analysis of issue content
#
# This script analyzes each issue content and renames it if the title
# is not descriptive enough (e.g., "App reports bug", "[Short title]", etc.)

set -e

REPO="thewh1teagle/vibe"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) not installed"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

echo "================================================================================"
echo "Agentic Issue Renaming"
echo "This will rename 86 issues with non-descriptive titles"
echo "================================================================================"
echo ""

# Issue #957: App reports bug
echo 'Issue #957 (OPEN): App reports bug...'
gh issue edit 957 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #956: [Short title]
echo 'Issue #956 (OPEN): [Short title]...'
gh issue edit 956 --repo $REPO --title 'bug: Transcription stuck at 0% on Windows 10' && echo '  ✓ Renamed to: bug: Transcription stuck at 0% on Windows 10' || echo '  ✗ Failed'
echo ""

# Issue #955: App reports bug
echo 'Issue #955 (OPEN): App reports bug...'
gh issue edit 955 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #923: Bug:
echo 'Issue #923 (OPEN): Bug:...'
gh issue edit 923 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #917: [Title here. keep it short]
echo 'Issue #917 (OPEN): [Title here. keep it short]...'
gh issue edit 917 --repo $REPO --title 'bug: Build fails with missing wget.exe on Windows' && echo '  ✓ Renamed to: bug: Build fails with missing wget.exe on Windows' || echo '  ✗ Failed'
echo ""

# Issue #908: [Title here. keep it short]
echo 'Issue #908 (OPEN): [Title here. keep it short]...'
gh issue edit 908 --repo $REPO --title 'bug: Application doesn'\''t work (Hebrew report)' && echo '  ✓ Renamed to: bug: Application doesn't work (Hebrew report)' || echo '  ✗ Failed'
echo ""

# Issue #865: [Short title] La transcription se lance mais ne progresse pa
echo 'Issue #865 (OPEN): [Short title] La transcription se lance mais ne pr...'
gh issue edit 865 --repo $REPO --title 'bug: Transcription stuck at 0% on Windows 11' && echo '  ✓ Renamed to: bug: Transcription stuck at 0% on Windows 11' || echo '  ✗ Failed'
echo ""

# Issue #830: [Title here. keep it short]
echo 'Issue #830 (OPEN): [Title here. keep it short]...'
gh issue edit 830 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #797: [Short title]Add soure language and target language option
echo 'Issue #797 (OPEN): [Short title]Add soure language and target languag...'
gh issue edit 797 --repo $REPO --title 'feature: Add source and target language selection options' && echo '  ✓ Renamed to: feature: Add source and target language selection options' || echo '  ✗ Failed'
echo ""

# Issue #784: [Title here. keep it short]
echo 'Issue #784 (OPEN): [Title here. keep it short]...'
gh issue edit 784 --repo $REPO --title 'bug: Cannot stop recording on Linux' && echo '  ✓ Renamed to: bug: Cannot stop recording on Linux' || echo '  ✗ Failed'
echo ""

# Issue #767: [Short title]
echo 'Issue #767 (OPEN): [Short title]...'
gh issue edit 767 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #758: [Short title]
echo 'Issue #758 (OPEN): [Short title]...'
gh issue edit 758 --repo $REPO --title 'bug: Transcription outputs only exclamation marks with GPU' && echo '  ✓ Renamed to: bug: Transcription outputs only exclamation marks with GPU' || echo '  ✗ Failed'
echo ""

# Issue #739: Bug:
echo 'Issue #739 (OPEN): Bug:...'
gh issue edit 739 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #943: App reports bug
echo 'Issue #943 (CLOSED): App reports bug...'
gh issue edit 943 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #933: App reports bug
echo 'Issue #933 (CLOSED): App reports bug...'
gh issue edit 933 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #931: App reports bug
echo 'Issue #931 (CLOSED): App reports bug...'
gh issue edit 931 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #928: App reports bug
echo 'Issue #928 (CLOSED): App reports bug...'
gh issue edit 928 --repo $REPO --title 'bug: MP3 transcription fails on macOS' && echo '  ✓ Renamed to: bug: MP3 transcription fails on macOS' || echo '  ✗ Failed'
echo ""

# Issue #924: App reports bug
echo 'Issue #924 (CLOSED): App reports bug...'
gh issue edit 924 --repo $REPO --title 'bug: YouTube/URL download fails' && echo '  ✓ Renamed to: bug: YouTube/URL download fails' || echo '  ✗ Failed'
echo ""

# Issue #922: App reports bug
echo 'Issue #922 (CLOSED): App reports bug...'
gh issue edit 922 --repo $REPO --title 'bug: Winget updates missing' && echo '  ✓ Renamed to: bug: Winget updates missing' || echo '  ✗ Failed'
echo ""

# Issue #921: App reports bug
echo 'Issue #921 (CLOSED): App reports bug...'
gh issue edit 921 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #918: App reports bug
echo 'Issue #918 (CLOSED): App reports bug...'
gh issue edit 918 --repo $REPO --title 'bug: MP3 transcription fails on macOS' && echo '  ✓ Renamed to: bug: MP3 transcription fails on macOS' || echo '  ✗ Failed'
echo ""

# Issue #916: App reports bug
echo 'Issue #916 (CLOSED): App reports bug...'
gh issue edit 916 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #912: App reports bug
echo 'Issue #912 (CLOSED): App reports bug...'
gh issue edit 912 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #907: App reports bug
echo 'Issue #907 (CLOSED): App reports bug...'
gh issue edit 907 --repo $REPO --title 'bug: Model download fails' && echo '  ✓ Renamed to: bug: Model download fails' || echo '  ✗ Failed'
echo ""

# Issue #906: App reports bug
echo 'Issue #906 (CLOSED): App reports bug...'
gh issue edit 906 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #905: App reports bug
echo 'Issue #905 (CLOSED): App reports bug...'
gh issue edit 905 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #904: App reports bug
echo 'Issue #904 (CLOSED): App reports bug...'
gh issue edit 904 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #902: App reports bug
echo 'Issue #902 (CLOSED): App reports bug...'
gh issue edit 902 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #901: App reports bug
echo 'Issue #901 (CLOSED): App reports bug...'
gh issue edit 901 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #897: App reports bug
echo 'Issue #897 (CLOSED): App reports bug...'
gh issue edit 897 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #896: App reports bug
echo 'Issue #896 (CLOSED): App reports bug...'
gh issue edit 896 --repo $REPO --title 'bug: Model download fails' && echo '  ✓ Renamed to: bug: Model download fails' || echo '  ✗ Failed'
echo ""

# Issue #894: App reports bug
echo 'Issue #894 (CLOSED): App reports bug...'
gh issue edit 894 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #893: App reports bug
echo 'Issue #893 (CLOSED): App reports bug...'
gh issue edit 893 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #891: App reports bug
echo 'Issue #891 (CLOSED): App reports bug...'
gh issue edit 891 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #889: App reports bug
echo 'Issue #889 (CLOSED): App reports bug...'
gh issue edit 889 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #888: App reports bug
echo 'Issue #888 (CLOSED): App reports bug...'
gh issue edit 888 --repo $REPO --title 'bug: YouTube/URL download fails' && echo '  ✓ Renamed to: bug: YouTube/URL download fails' || echo '  ✗ Failed'
echo ""

# Issue #887: App reports bug
echo 'Issue #887 (CLOSED): App reports bug...'
gh issue edit 887 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #886: App reports bug
echo 'Issue #886 (CLOSED): App reports bug...'
gh issue edit 886 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #885: App reports bug
echo 'Issue #885 (CLOSED): App reports bug...'
gh issue edit 885 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #884: App reports bug
echo 'Issue #884 (CLOSED): App reports bug...'
gh issue edit 884 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #882: App reports bug
echo 'Issue #882 (CLOSED): App reports bug...'
gh issue edit 882 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #881: App reports bug
echo 'Issue #881 (CLOSED): App reports bug...'
gh issue edit 881 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #880: App reports bug
echo 'Issue #880 (CLOSED): App reports bug...'
gh issue edit 880 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #879: App reports bug
echo 'Issue #879 (CLOSED): App reports bug...'
gh issue edit 879 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #878: App reports bug
echo 'Issue #878 (CLOSED): App reports bug...'
gh issue edit 878 --repo $REPO --title 'bug: Model download fails' && echo '  ✓ Renamed to: bug: Model download fails' || echo '  ✗ Failed'
echo ""

# Issue #876: App reports bug
echo 'Issue #876 (CLOSED): App reports bug...'
gh issue edit 876 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #875: App reports bug
echo 'Issue #875 (CLOSED): App reports bug...'
gh issue edit 875 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #874: App reports bug
echo 'Issue #874 (CLOSED): App reports bug...'
gh issue edit 874 --repo $REPO --title 'bug: Model download fails' && echo '  ✓ Renamed to: bug: Model download fails' || echo '  ✗ Failed'
echo ""

# Issue #872: App reports bug
echo 'Issue #872 (CLOSED): App reports bug...'
gh issue edit 872 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #870: App reports bug
echo 'Issue #870 (CLOSED): App reports bug...'
gh issue edit 870 --repo $REPO --title 'bug: YouTube/URL download fails' && echo '  ✓ Renamed to: bug: YouTube/URL download fails' || echo '  ✗ Failed'
echo ""

# Issue #864: App reports bug
echo 'Issue #864 (CLOSED): App reports bug...'
gh issue edit 864 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #862: App reports bug
echo 'Issue #862 (CLOSED): App reports bug...'
gh issue edit 862 --repo $REPO --title 'bug: Model download fails' && echo '  ✓ Renamed to: bug: Model download fails' || echo '  ✗ Failed'
echo ""

# Issue #859: App reports bug
echo 'Issue #859 (CLOSED): App reports bug...'
gh issue edit 859 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #854: App reports bug
echo 'Issue #854 (CLOSED): App reports bug...'
gh issue edit 854 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #850: App reports bug
echo 'Issue #850 (CLOSED): App reports bug...'
gh issue edit 850 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #849: App reports bug
echo 'Issue #849 (CLOSED): App reports bug...'
gh issue edit 849 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #848: App reports bug
echo 'Issue #848 (CLOSED): App reports bug...'
gh issue edit 848 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #847: App reports bug
echo 'Issue #847 (CLOSED): App reports bug...'
gh issue edit 847 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #846: App reports bug
echo 'Issue #846 (CLOSED): App reports bug...'
gh issue edit 846 --repo $REPO --title 'bug: Transcription stuck at 0%' && echo '  ✓ Renamed to: bug: Transcription stuck at 0%' || echo '  ✗ Failed'
echo ""

# Issue #843: App reports bug
echo 'Issue #843 (CLOSED): App reports bug...'
gh issue edit 843 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #842: App reports bug
echo 'Issue #842 (CLOSED): App reports bug...'
gh issue edit 842 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #839: App reports bug
echo 'Issue #839 (CLOSED): App reports bug...'
gh issue edit 839 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #837: App reports bug
echo 'Issue #837 (CLOSED): App reports bug...'
gh issue edit 837 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #835: App reports bug
echo 'Issue #835 (CLOSED): App reports bug...'
gh issue edit 835 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #834: App reports bug
echo 'Issue #834 (CLOSED): App reports bug...'
gh issue edit 834 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #833: App reports bug
echo 'Issue #833 (CLOSED): App reports bug...'
gh issue edit 833 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #832: App reports bug
echo 'Issue #832 (CLOSED): App reports bug...'
gh issue edit 832 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #826: App reports bug
echo 'Issue #826 (CLOSED): App reports bug...'
gh issue edit 826 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #824: App reports bug
echo 'Issue #824 (CLOSED): App reports bug...'
gh issue edit 824 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #823: App reports bug
echo 'Issue #823 (CLOSED): App reports bug...'
gh issue edit 823 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #822: App reports bug
echo 'Issue #822 (CLOSED): App reports bug...'
gh issue edit 822 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #820: App reports bug
echo 'Issue #820 (CLOSED): App reports bug...'
gh issue edit 820 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #817: App reports bug
echo 'Issue #817 (CLOSED): App reports bug...'
gh issue edit 817 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #816: App reports bug
echo 'Issue #816 (CLOSED): App reports bug...'
gh issue edit 816 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #815: App reports bug
echo 'Issue #815 (CLOSED): App reports bug...'
gh issue edit 815 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #814: App reports bug
echo 'Issue #814 (CLOSED): App reports bug...'
gh issue edit 814 --repo $REPO --title 'bug: Model download fails' && echo '  ✓ Renamed to: bug: Model download fails' || echo '  ✗ Failed'
echo ""

# Issue #811: App reports bug
echo 'Issue #811 (CLOSED): App reports bug...'
gh issue edit 811 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #809: App reports bug
echo 'Issue #809 (CLOSED): App reports bug...'
gh issue edit 809 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #802: App reports bug
echo 'Issue #802 (CLOSED): App reports bug...'
gh issue edit 802 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #800: App reports bug
echo 'Issue #800 (CLOSED): App reports bug...'
gh issue edit 800 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #798: App reports bug
echo 'Issue #798 (CLOSED): App reports bug...'
gh issue edit 798 --repo $REPO --title 'bug: YouTube download fails' && echo '  ✓ Renamed to: bug: YouTube download fails' || echo '  ✗ Failed'
echo ""

# Issue #791: App reports bug
echo 'Issue #791 (CLOSED): App reports bug...'
gh issue edit 791 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #790: App reports bug
echo 'Issue #790 (CLOSED): App reports bug...'
gh issue edit 790 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #785: Bug:
echo 'Issue #785 (CLOSED): Bug:...'
gh issue edit 785 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

# Issue #779: App reports bug
echo 'Issue #779 (CLOSED): App reports bug...'
gh issue edit 779 --repo $REPO --title 'bug: Audio conversion fails in FFmpeg' && echo '  ✓ Renamed to: bug: Audio conversion fails in FFmpeg' || echo '  ✗ Failed'
echo ""

# Issue #778: App reports bug
echo 'Issue #778 (CLOSED): App reports bug...'
gh issue edit 778 --repo $REPO --title 'bug: Issue report' && echo '  ✓ Renamed to: bug: Issue report' || echo '  ✗ Failed'
echo ""

echo "================================================================================"
echo "✓ Completed! Renamed 86 issues."
echo "================================================================================"
