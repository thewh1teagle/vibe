import glob
import shutil
import subprocess
from pathlib import Path
from typing import List, Union

from config import *


def success(message: str):
    print(f'✅ {message}')

def error(message: str):
    print(f'❌ {message}')

def run(cmd: Union[str, List[str]], cwd: Union[str, Path] = None, capture = False, shell = True, check = True, env: dict = None, timeout = None):
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
            env=env,
            timeout=timeout
        )


def release_info():
    binary = get_binary_path()
    name, version, suffix = binary.name.split('_')
    arch, ext = suffix.split('.')
    return name, version, arch, ext

def get_binary_path() -> Path:
    binary = glob.glob(str(CFG_BUNDLE_PATH / CFG_BIN_PATTERN))[0]
    binary = CFG_ROOT / 'target/release/bundle' / binary
    return binary

def prepare_ffmpeg():
    env = os.environ.copy()
    env['PATH'] = f'C:\Program Files\\7-Zip;{env["PATH"]}'
    if not CFG_FINAL_FFMPEG_PATH.exists():
        if CFG_OS == "Windows":
            run(f'powershell -Command "Invoke-WebRequest -Uri \'{CFG_FFMPEG_URL}\' -OutFile \'{CFG_FFMPEG_PATH}.7z\'"')
            run(f'7z x {CFG_FFMPEG_PATH}.7z', cwd=CFG_SRC_TAURI, env=env)
            run(f"move {CFG_FFMPEG_PATH} {CFG_FINAL_FFMPEG_PATH}")
            files = glob.glob(str(CFG_FINAL_FFMPEG_PATH / 'lib/x64/*.lib'))
            for file in files:
                shutil.move(file, CFG_FINAL_FFMPEG_PATH / 'lib/')
            run(f"del {CFG_FFMPEG_PATH}.7z")
        else:
            run(f'wget -nc --show-progress {CFG_FFMPEG_URL} -O {CFG_FFMPEG_NAME}.tar.xz', cwd=CFG_FFMPEG_PATH.parent)
            run(f'tar xf {CFG_FFMPEG_NAME}.tar.xz', cwd=CFG_FFMPEG_PATH.parent)
    # Prepare openblas
    if CFG_OS == "Windows" and not CFG_WINDOWS_OPENBLAS_PATH.exists():
        run(f'powershell -Command "Invoke-WebRequest -Uri \'{CFG_WINDOWS_OPENBLAS_URL}\' -OutFile \'{CFG_WINDOWS_OPENBLAS_NAME}.zip\'"', cwd=CFG_SRC_TAURI)
        run(f'7z x {CFG_WINDOWS_OPENBLAS_NAME}.zip -o{CFG_WINDOWS_OPENBLAS_PATH}', cwd=CFG_SRC_TAURI, env=env)
        run(f"del {CFG_WINDOWS_OPENBLAS_NAME}.zip", cwd=CFG_SRC_TAURI)
        shutil.move(CFG_WINDOWS_OPENBLAS_PATH / 'include/', CFG_WINDOWS_OPENBLAS_PATH / 'lib/')
        shutil.move(CFG_WINDOWS_OPENBLAS_PATH / 'lib/libopenblas.lib', CFG_WINDOWS_OPENBLAS_PATH / 'lib/openblas.lib')

    success("Setup ffmpeg")