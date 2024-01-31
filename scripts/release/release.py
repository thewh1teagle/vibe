from utils import success, error, run, get_binary_path, release_info
import glob
import platform
from github_release import gh_release_create
from pathlib import Path
from config import *
from macos import prepare_darwin_ffmpeg, sign_with_test_key

def pre_build():
    success(f'Platform {CFG_OS}')
    if CFG_GH_TOKEN:
        success("Found Github token")
    else:
        error("No Github token")
        exit(1)
    if CFG_OS == 'Darwin':
        prepare_darwin_ffmpeg()

def build():
    run('cargo tauri build')
    success("Build")

def post_build():
    success(f"Found binary at {get_binary_path()}")
    if CFG_OS == 'Darwin':
        sign_with_test_key()

def upload():
    success("Upload")

if __name__ == '__main__':
    # pre_build()
    # build()
    post_build()
    name, version, arch, ext = release_info()
    success(f"Found {name} version {version} for {arch}")
    upload()

