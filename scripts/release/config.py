import platform
from github_release import gh_release_create
from pathlib import Path
import os

CFG_ROOT = Path(__file__).parent / '../../'
CFG_ROOT = CFG_ROOT.resolve().absolute()
CFG_SRC_TAURI = CFG_ROOT / 'desktop/src-tauri'
CFG_OS = platform.system() # Windows / Linux / Darwin
CFG_GH_TOKEN = os.getenv('GITHUB_TOKEN')
CFG_BIN_PATTERN = {
    "Linux": "deb/*.deb",
    "Windows": "nsis/*.exe",
    "Darwin": "dmg/*.dmg"
}[CFG_OS]
CFG_FFMPEG_NAME = {
    "Linux": "ffmpeg-6.1-linux-clang-default",
    "Windows": "ffmpeg-6.0-windows-desktop-clang-default",
    "Darwin": "ffmpeg-6.1-macOS-default"
}[CFG_OS]
CFG_FFMPEG_PATH = CFG_SRC_TAURI / CFG_FFMPEG_NAME
CFG_FFMPEG_URL = {
    "Linux": f"https://master.dl.sourceforge.net/project/avbuild/linux/{CFG_FFMPEG_NAME}.tar.xz?viasf=1",
    "Windows": f"https://master.dl.sourceforge.net/project/avbuild/windows-desktop/{CFG_FFMPEG_NAME}.tar.xz?viasf=1",
    "Darwin": f"https://master.dl.sourceforge.net/project/avbuild/macOS/{CFG_FFMPEG_NAME}.tar.xz?viasf=1"
}[CFG_OS]
CFG_WINDOWS_NODE_PATH = "C:\\Program Files\\nodejs"