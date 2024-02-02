import windows
from config import *
from github_release import gh_asset_delete, gh_asset_upload, gh_release_create
from macos import sign_with_test_key
from utils import error, get_binary_path, prepare_ffmpeg, release_info, run, success

def pre_build():
    success(f'Platform {CFG_OS}')
    if CFG_GH_TOKEN:
        success("Found Github token")
    else:
        error("No Github token")
        exit(1)
    if not CFG_OS == "Windows":
        prepare_ffmpeg()

def build():
    env = os.environ.copy()
    env["FFMPEG_DIR"] = str(CFG_FFMPEG_PATH)
    if CFG_OS == "Windows":
        success(f"Patch NodeJS path to {CFG_WINDOWS_NODE_PATH}")
        env["PATH"] = f'{CFG_WINDOWS_NODE_PATH};{env["PATH"]}'
        openblas_path = os.getenv("MINGW_PREFIX")
        # fix include path for msys2
        env["C_INCLUDE_PATH"] = f'${openblas_path}/include/openblas;{env["C_INCLUDE_PATH"]}'
        run('cargo tauri build', env=env)
    run('cargo tauri build', env=env)
    success("Build")

def post_build():
    success(f"Found binary at {get_binary_path()}")
    if CFG_OS == 'Darwin':
        sign_with_test_key()

def upload():
    _name, version, _arch, _ext = release_info()
    binary = get_binary_path()
    repo_name = 'thewh1teagle/vibe'
    tag_name = f'v{version}'

    gh_release_create(
        'thewh1teagle/vibe', 
        tag_name=f'v{version}', 
        name=f'Vibe {version}', 
    )
    # delete previous if exists
    gh_asset_delete(repo_name, tag_name, pattern=str(binary.name))
    success("Delete Previous Asset")
    # upload
    gh_asset_upload(repo_name, tag_name, pattern=str(binary.absolute()))
    success("Upload Asset")

if __name__ == '__main__':
    pre_build()
    build()
    post_build()
    name, version, arch, ext = release_info()
    success(f"Found {name} version {version} for {arch}")
    upload()

