import glob
import json
import shutil
from ctypes.util import find_library
from pathlib import Path

from config import *

copied = []
# copy DLLs
def prepare_dlls():
    windows_config = CFG_SRC_TAURI / 'tauri.windows.conf.json'
    with open(windows_config, 'r') as f:
        RESOURCES = json.load(f)['tauri']['bundle']['resources']

    
    for path in RESOURCES:
        if path == 'WebView2Loader.dll':
            continue
        if '/' not in path:
            # try to get first from ffmpeg dir
            
            from_ffmpeg_dir = Path(CFG_FFMPEG_PATH / f'bin/x64/{path}')
            if from_ffmpeg_dir.exists():
                path = str(from_ffmpeg_dir)
            else:
                found_path = find_library(path)
                if not found_path:
                    raise Exception(f'library {path} not found!')
                else:
                    path = found_path


        path = Path(path)
        new_path = CFG_SRC_TAURI / path.name
        shutil.copy(path, new_path, follow_symlinks=True)
        
    # also copy webviewloader
    webview_dll = glob.glob(str(CFG_SRC_TAURI / "../../target/release/build/webview2-com-sys*/out/x64/WebView2Loader.dll"))[0]
    webview_dll = Path(webview_dll)
    new_path = CFG_SRC_TAURI / webview_dll.name
    shutil.copy(webview_dll, new_path, follow_symlinks=True)
def clean_dlls():
    windows_config = CFG_SRC_TAURI / 'tauri.windows.conf.json'
    with open(windows_config, 'r') as f:
        RESOURCES = json.load(f)['tauri']['bundle']['resources']
    for path in RESOURCES:
        path = CFG_SRC_TAURI / path
        path.unlink()