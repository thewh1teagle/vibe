import subprocess
from pathlib import Path
from typing import List, Union
import glob
from config import *

def success(message: str):
    print(f'✅ {message}')

def error(message: str):
    print(f'❌ {message}')

def run(cmd: Union[str, List[str]], cwd: Union[str, Path] = None, capture = False, shell = True, check = True, env: dict = None):
    # convert to list
    cmd = [cmd] if isinstance(cmd, str) else cmd
    for c in cmd:
        subprocess.run(
            c, 
            check=check, 
            shell=shell, 
            cwd=cwd, 
            stdout=subprocess.PIPE if capture else None, 
            stderr=subprocess.PIPE if capture else None,
            env=env
        )


def release_info():
    binary = get_binary_path()
    name, version, suffix = binary.name.split('_')
    arch, ext = suffix.split('.')
    return name, version, arch, ext

def get_binary_path() -> Path:
    binary = glob.glob(CFG_BIN_PATTERN, root_dir=CFG_ROOT / 'target/release/bundle/')[0]
    binary = CFG_ROOT / 'target/release/bundle' / binary
    return binary

def prepare_ffmpeg():
    url=f"https://master.dl.sourceforge.net/project/avbuild/macOS/{CFG_FFMPEG_NAME}.tar.xz?viasf=1"
    if not (CFG_FFMPEG_PATH).exists():
        run(f'wget -q -nc --show-progress {url} -O {CFG_FFMPEG_NAME}.tar.xz', cwd=CFG_FFMPEG_PATH.parent)
    run(f'tar xf {CFG_FFMPEG_NAME}.tar.xz', cwd=CFG_FFMPEG_PATH.parent)
    success("Setup ffmpeg")