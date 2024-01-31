import platform
from github_release import gh_release_create
from pathlib import Path
import os


ROOT = Path(__file__).parent / '../../'
ROOT = ROOT.resolve().absolute()
SRC_TAURI = ROOT / 'desktop/src-tauri'
CFG_OS = platform.system() # Windows / Linux / Darwin
CFG_GH_TOKEN = os.getenv('GITHUB_TOKEN')
CFG_BIN_PATTERN = {
    "Linux": "deb/*.deb",
    "Window": "nsis/*.exe",
    "Darwin": "dmg/*.dmg"
}[CFG_OS]
