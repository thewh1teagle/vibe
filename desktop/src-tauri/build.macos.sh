parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
cd "$parent_path"

cargo tauri build
cd ../../target/release/bundle/dmg/
name=$(ls vibe_* | head -n 1)
hdiutil attach -nobrowse -mountpoint /Volumes/vibe $name
cp -R /Volumes/vibe .
hdiutil detach /Volumes/vibe
codesign -s - ./vibe/vibe.app/Contents/MacOS/vibe
mv $name $name.old
hdiutil create -format UDZO -srcfolder ./vibe $name