import subprocess
from pathlib import Path
from typing import List, Union
import glob
from config import *

def success(message: str):
    print(f'✅ {message}')

def error(message: str):
    print(f'❌ {message}')

def run(cmd: Union[str, List[str]], cwd: Union[str, Path] = None, capture = False, shell = True, check = True):
    # convert to list
    cmd = [cmd] if isinstance(cmd, str) else cmd
    for c in cmd:
        subprocess.run(
            c, 
            check=check, 
            shell=shell, 
            cwd=cwd, 
            stdout=subprocess.PIPE if capture else None, 
            stderr=subprocess.PIPE if capture else None
        )


def release_info():
    binary = get_binary_path()
    name, version, suffix = binary.name.split('_')
    arch, ext = suffix.split('.')
    return name, version, arch, ext

def get_binary_path() -> Path:
    binary = glob.glob(CFG_BIN_PATTERN, root_dir=ROOT / 'target/release/bundle/')[0]
    binary = ROOT / 'target/release/bundle' / binary
    return binary