import os
import platform
from pathlib import Path

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
    "Windows": "ffmpeg-6.1-windows-desktop-vs2022ltl-default",
    "Darwin": "ffmpeg-6.1-macOS-default"
}[CFG_OS]
CFG_FFMPEG_PATH = CFG_SRC_TAURI / CFG_FFMPEG_NAME
CFG_FINAL_FFMPEG_PATH = CFG_SRC_TAURI / 'ffmpeg'
CFG_FFMPEG_URL = {
    "Linux": f"https://master.dl.sourceforge.net/project/avbuild/linux/{CFG_FFMPEG_NAME}.tar.xz?viasf=1",
    "Windows": f"https://master.dl.sourceforge.net/project/avbuild/windows-desktop/{CFG_FFMPEG_NAME}.7z?viasf=1",
    "Darwin": f"https://master.dl.sourceforge.net/project/avbuild/macOS/{CFG_FFMPEG_NAME}.tar.xz?viasf=1"
}[CFG_OS]
CFG_WINDOWS_NODE_PATH = "C:\\Program Files\\nodejs"
CFG_BUNDLE_PATH = CFG_ROOT / 'target/release/bundle/'


# Windows
CFG_WINDOWS_OPENBLAS_NAME = "OpenBLAS-0.3.26-x64"
CFG_WINDOWS_OPENBLAS_PATH = CFG_SRC_TAURI / "openblas"
CFG_WINDOWS_OPENBLAS_URL = f"https://github.com/OpenMathLib/OpenBLAS/releases/download/v0.3.26/{CFG_WINDOWS_OPENBLAS_NAME}.zip"