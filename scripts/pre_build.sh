#!/bin/bash

# Windows uses msys2 
# With
# C:\msys64\msys2_shell.cmd -defterm -use-full-path -no-start -ucrt64 -here -c "pre_build.sh"
# And fix paths with echo $(cygpath -w "$any_bad_path")
# Windows:
# 1. Prepare FFMPEG (into src-tauri/ffmpeg)
# 2. Prepare OpenBlas (into src-tauri/openblas)
# 3. Add ENV

# MacOS:
# 1. Prepare FFMPEG (into src-tauri/ffmpeg)
# 2. Add ENV

# Prepare paths
cd "$(dirname "${BASH_SOURCE[0]}")/../desktop/src-tauri" || exit

# Detect OS
FFMPEG_REALNAME="ffmpeg"
OPENBLAS_REALNAME="openblas"

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    FFMPEG_NAME="ffmpeg-6.1-macOS-default"
    FFMPEG_URL="https://master.dl.sourceforge.net/project/avbuild/macOS/$FFMPEG_NAME.tar.xz?viasf=1"
else
    OS="windows"
    FFMPEG_NAME="ffmpeg-6.1-windows-desktop-vs2022ltl-default"
    FFMPEG_URL="https://master.dl.sourceforge.net/project/avbuild/windows-desktop/$FFMPEG_NAME.7z?viasf=1"
    OPENBLAS_NAME="OpenBLAS-0.3.26-x64"
    OPENBLAS_URL="https://github.com/OpenMathLib/OpenBLAS/releases/download/v0.3.26/$OPENBLAS_NAME.zip"
fi

# Check if running in action
if [ "$GITHUB_ACTIONS" == "true" ]; then
    echo "CI detected"
    CI=true
else
    CI=false
fi

# Prepare FFMPEG
if [[ "$OS" == "macos" ]]; then
    if [ ! -d $FFMPEG_REALNAME ]; then
        wget -nc --show-progress $FFMPEG_URL -O $FFMPEG_NAME.tar.xz
        tar xf $FFMPEG_NAME.tar.xz
        mv $FFMPEG_NAME $FFMPEG_REALNAME
        rm $FFMPEG_NAME.tar.xz
    fi
fi

# C:\msys64\usr\bin\bash.exe
if [[ "$OS" == "windows" ]]; then
    if [ ! -d $FFMPEG_REALNAME ]; then
        wget -nc --show-progress $FFMPEG_URL -O $FFMPEG_NAME.7z
        7z x $FFMPEG_NAME.7z
        mv $FFMPEG_NAME $FFMPEG_REALNAME
        rm $FFMPEG_NAME.tar.xz
    fi

    if [ ! -d $OPENBLAS_REALNAME ]; then
        wget -nc --show-progress $OPENBLAS_URL -O $OPENBLAS_NAME.zip
        7z x $OPENBLAS_NAME.zip
        mv $OPENBLAS_NAME $OPENBLAS_REALNAME
        rm $OPENBLAS_NAME.zip
    fi
fi


if [ $CI == false ]; then
    echo "For build, execute:"
    if [ OS == "windows" ]; then
        echo "set FFMPEG_DIR=\"/$(pwd)/$FFMPEG_REALNAME\""
        echo "set OPENBLAS_PATH=\"$(pwd)/$OPENBLAS_REALNAME\""
    else
        echo "export FFMPEG_DIR=\"$(pwd)/$FFMPEG_REALNAME\""
    fi
    echo "npx tauri build"
else
    echo "Adding environment variables..."
    # FFMPEG
    echo "FFMPEG_DIR=$FFMPEG_REALNAME" >> $GITHUB_ENV
    # OpenBLAS
    if [ "$OS" == "windows" ]; then
        echo "OPENBLAS_PATH=$OPENBLAS_REALNAME" >> $GITHUB_ENV
    fi
fi
