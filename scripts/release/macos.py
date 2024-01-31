from utils import success, error, run, get_binary_path
from config import *

def sign_with_test_key():
    binary = get_binary_path()
    print('binary is ', binary.absolute())
    run(f'hdiutil attach -nobrowse -mountpoint /Volumes/vibe {binary}', cwd=binary.parent)
    run('cp -R /Volumes/vibe .', cwd=binary.parent)
    run('hdiutil detach /Volumes/vibe', cwd=binary.parent)
    run('codesign -s - ./vibe/vibe.app/Contents/MacOS/vibe', cwd=binary.parent)
    run(f'mv {binary} {binary.with_suffix(".old")}', cwd=binary.parent)
    run(f'hdiutil create -format UDZO -srcfolder ./vibe {binary}', cwd=binary.parent)
    success("Sign")



