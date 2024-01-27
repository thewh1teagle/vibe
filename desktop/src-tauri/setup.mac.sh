#!/bin/bash

parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
cd "$parent_path"

name="ffmpeg-6.1-macOS-default"
url="https://master.dl.sourceforge.net/project/avbuild/macOS/$name.tar.xz?viasf=1"
wget -q -nc --show-progress $url -O "$name.tar.xz"
tar xf "$name.tar.xz"
