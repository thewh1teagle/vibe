#!/bin/bash

# Prepare FFMPEG and OpenBLAS for CI build

# Windows uses msys2
# With
# C:\msys64\msys2_shell.cmd -defterm -use-full-path -no-start -ucrt64 -here -c "scripts/pre_build.sh"
# And fix paths with echo $(cygpath -w "$any_bad_path")
# if you use opencl feature, you need to install opencl with vcpkg


# Windows:
# 1. Prepare FFMPEG (into src-tauri/ffmpeg)
# 2. Prepare OpenBlas (into src-tauri/openblas)
# 3. Add ENV

# MacOS:
# 1. Prepare FFMPEG (into src-tauri/ffmpeg)
# 2. Add ENV

# For testing as CI
# EMULATE_CI=true scripts/pre_build.sh

# Prepare paths
cd "$(dirname "${BASH_SOURCE[0]}")/../desktop/src-tauri" || exit

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
else
    OS="windows"
fi
echo "Detect OS $OS"


# Common config
FFMPEG_REALNAME="ffmpeg"
OPENBLAS_REALNAME="openblas"
CLBlast_REALNAME="clblast"

# Drawin config
if [ "$OS" == "macos" ]; then
    FFMPEG_NAME="ffmpeg-6.1-macOS-default"
    FFMPEG_URL="https://master.dl.sourceforge.net/project/avbuild/macOS/$FFMPEG_NAME.tar.xz?viasf=1"
fi
# Windows config
if [ "$OS" == "windows" ]; then
    # FFMPEG
    FFMPEG_NAME="ffmpeg-6.1-windows-desktop-vs2022ltl-default"
    FFMPEG_URL="https://master.dl.sourceforge.net/project/avbuild/windows-desktop/$FFMPEG_NAME.7z?viasf=1"
    # OpenBlas
    OPENBLAS_NAME="OpenBLAS-0.3.26-x64"
    OPENBLAS_URL="https://github.com/OpenMathLib/OpenBLAS/releases/download/v0.3.26/$OPENBLAS_NAME.zip"
    # CLBlast (x1.5 Faster)
    CLBlast_NAME="CLBlast-1.6.2-windows-x64"
    CLBlast_URL="https://github.com/CNugteren/CLBlast/releases/download/1.6.2/$CLBlast_NAME.zip"
    # Used for local development
    export PATH="$PATH:C:\Program Files\7-Zip"
fi

# Check if emulate CI
if [ "$EMULATE_CI" == "true" ]; then
    echo "Emulate CI..."
    GITHUB_ACTIONS=true
    GITHUB_ENV=".GITHUB_ENV"
fi

# Check if running in action
if [ "$GITHUB_ACTIONS" == "true" ]; then
    echo "CI detected"
    CI=true
else
    CI=false
fi

# Prepare FFMPEG for MacOS
if [[ "$OS" == "macos" ]]; then
    if [ ! -d $FFMPEG_REALNAME ]; then
        wget -nc --show-progress $FFMPEG_URL -O $FFMPEG_NAME.tar.xz
        tar xf $FFMPEG_NAME.tar.xz
        mv $FFMPEG_NAME $FFMPEG_REALNAME
        rm $FFMPEG_NAME.tar.xz
    fi
fi

# Prepare FFMPEG for Windows
if [[ "$OS" == "windows" ]]; then
    if [ ! -d $FFMPEG_REALNAME ]; then
        wget -nc --show-progress $FFMPEG_URL -O $FFMPEG_NAME.7z
        7z x $FFMPEG_NAME.7z
        mv $FFMPEG_NAME $FFMPEG_REALNAME
        rm $FFMPEG_NAME.tar.xz
        # move ffmpeg/lib/x64 to ffmpeg/lib
        mv $FFMPEG_REALNAME/lib/x64/* $FFMPEG_REALNAME/lib/
    fi
fi

# Prepare OpenBLAS for Windows
if [ "$OS" == "windows" ]; then
    if [ ! -d $OPENBLAS_REALNAME ]; then
        wget -nc --show-progress $OPENBLAS_URL -O $OPENBLAS_NAME.zip
        7z x $OPENBLAS_NAME.zip -o$OPENBLAS_REALNAME
        rm $OPENBLAS_NAME.zip
        
        # Patch it
        cp -rf $OPENBLAS_REALNAME/include/ "$OPENBLAS_REALNAME/lib/"
        # it tries to link only openblas.lib but our is libopenblas.lib
        cp $OPENBLAS_REALNAME/lib/libopenblas.lib $OPENBLAS_REALNAME/lib/openblas.lib
    fi
fi

# Prepare CLBlast for Windows
if [ "$OS" == "windows" ]; then
    if [ ! -d $CLBlast_REALNAME ]; then
        wget -nc --show-progress $CLBlast_URL -O $CLBlast_NAME.zip
        7z x $CLBlast_NAME.zip -o$CLBlast_REALNAME
        rm $CLBlast_NAME.zip
    fi
fi

# Prepare packages for Linux
if [ "$OS" == "linux" ]; then
    sudo apt-get update
    sudo apt-get install -y ffmpeg libopenblas-dev # runtime
    sudo apt-get install -y pkg-config build-essential libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev clang cmake # tauri
    sudo apt-get install -y libavutil-dev libavformat-dev libavfilter-dev libavdevice-dev # ffmpeg
fi

# Set aboluste paths for OpenBlas and FFMPEG
FFMPEG_PATH="$(pwd)/$FFMPEG_REALNAME"
OPENBLAS_PATH="$(pwd)/$OPENBLAS_REALNAME/lib" # whisper.cpp takes from here
CLBlast_PATH="$(pwd)/$CLBlast_REALNAME/lib/cmake/CLBlast" # whisper.cpp takes from here
LIBCLANG_PATH="C:\Program Files\LLVM\bin"
CMAKE_PATH="C:\Program Files\CMake\bin"

# Fix windowspaths
if [ $OS == "windows" ]; then
    FFMPEG_PATH=$(cygpath -w "$FFMPEG_PATH")
    OPENBLAS_PATH=$(cygpath -w "$OPENBLAS_PATH")
    CLBlast_PATH=$(cygpath -w "$CLBlast_PATH")
fi

# If not CI then just show the commands to build
if [ $CI == false ]; then
    echo "For build, execute:"
    if [ $OS == "windows" ]; then
        echo "\$env:FFMPEG_DIR = \"$FFMPEG_PATH\""
        echo "\$env:OPENBLAS_PATH = \"$OPENBLAS_PATH\""
        echo "\$env:CLBlast_DIR = \"$CLBlast_PATH\""
        echo "\$env:LIBCLANG_PATH = \"$LIBCLANG_PATH\""
        echo "\$env:PATH += \"$CMAKE_PATH\""
    else
        echo "export FFMPEG_DIR=\"$FFMPEG_PATH\""
    fi
    echo "npx tauri build"
fi

# If CI then add environment variables to Github
if [ $CI == true ]; then
    echo "Adding environment variables..."
    # FFMPEG
    if [[ "$OS" == "macos" || "$OS" == "windows" ]]; then
        echo "Adding FFMPEG_DIR=$FFMPEG_PATH"
        echo "FFMPEG_DIR=$FFMPEG_PATH" >> "$GITHUB_ENV"
    fi
    # OpenBLAS
    if [ "$OS" == "windows" ]; then
        echo "Adding OPENBLAS_PATH=$OPENBLAS_PATH"
        echo "OPENBLAS_PATH=$OPENBLAS_PATH" >> "$GITHUB_ENV"
        echo "CLBlast_DIR=$CLBlast_PATH" >> "$GITHUB_ENV"
    fi
fi
