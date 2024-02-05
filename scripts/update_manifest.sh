# Prepare manifest
# Used in both CI and development

cd "$(dirname "${BASH_SOURCE[0]}")/../landing/src/lib" || exit
name="manifest.json"
wget -q --show-progress "https://github.com/thewh1teagle/vibe/releases/latest/download/latest.json" -O $name
echo "Manifest updated at $(pwd)/$name to $(cat $name)"