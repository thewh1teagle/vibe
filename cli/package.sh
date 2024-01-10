#!/bin/bash

NAME=ruscribe
VERSION="0.0.1"
TARGET="$NAME-$VERSION"

pacman --needed -S $MINGW_PACKAGE_PREFIX-{rust,ffmpeg} git zip
cargo build --release
mkdir -p $TARGET
cp target/release/$NAME.exe $TARGET/

DEPS=$(ldd target/release/$NAME.exe | awk '{print $3}' | grep -v 'System32' | grep 'ucrt64')

# while read -r DEP_PATH; do
#     echo "$DEP_PATH"
# done <<< "$DEPS"
for DLL_PATH in $DEPS; do
    cp $DLL_PATH $TARGET/
done