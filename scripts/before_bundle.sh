#!/bin/bash

# Sign the app and dylib with Ad-hoc signature (tauri enfore runtime flag from codesign which cause crash)

# Prepare paths
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit

codesign -f -s - target/release/vibe
find ./target -type f -name "*.dylib" -exec codesign -f -s - {} \;
