#!/bin/bash
# Linux installer for Vibe
# Supports Linux x86-64 with RPM / DEB / PKG / Arch (vibe-bin)
# Accepts tag in the first argument

# Usage:
# ./installer.sh {tag}

# Available at https://thewh1teagle.github.io/vibe/installer.sh
# Via curl -sSf https://thewh1teagle.github.io/vibe/installer.sh | sh -s {tag}

set -e

TAG=$1
if [ -z "$TAG" ]; then
    echo "Error: No tag specified. Usage: ./installer.sh {tag}"
    exit 1
fi

# Determine the package type and download the appropriate file
echo "Downloading Vibe version $TAG..."

RPM_URL="https://github.com/thewh1teagle/vibe/releases/download/$TAG/vibe-$TAG-1.x86_64.rpm"
DEB_URL="https://github.com/thewh1teagle/vibe/releases/download/$TAG/vibe-$TAG-1.x86_64.deb"

# Create temporary directory for downloading
TEMP_DIR=$(mktemp -d)
cd $TEMP_DIR

# Download the correct package based on the distribution
if [ -f /etc/os-release ]; then
    # Check for the package manager
    if grep -iq "ubuntu\|debian" /etc/os-release; then
        echo "Detected Debian/Ubuntu. Downloading DEB package..."
        wget -q "$DEB_URL" -O vibe.deb
        sudo dpkg -i vibe.deb
        sudo apt-get install -f -y
    elif grep -iq "centos\|fedora\|rhel" /etc/os-release; then
        echo "Detected CentOS/Fedora/RHEL. Downloading RPM package..."
        wget -q "$RPM_URL" -O vibe.rpm
        sudo rpm -ivh vibe.rpm
    elif grep -iq "arch" /etc/os-release; then
        echo "Detected Arch Linux. Installing vibe-bin using pacman..."
        sudo pacman -S vibe-bin
    else
        echo "Unsupported Linux distribution."
        exit 1
    fi
else
    echo "Unable to determine the package manager. Please install the package manually."
    exit 1
fi

# Clean up
cd ..
rm -rf $TEMP_DIR

echo "Vibe installation complete!"
