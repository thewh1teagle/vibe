from pathlib import Path
import subprocess
import shutil
import os
import json

TARGET = Path(__file__).parent
CONF = TARGET / 'tauri.conf.json'
RESOURCES = [
    "C:\\msys64\\ucrt64\\bin\\avcodec-60.dll",
    "C:\\msys64\\ucrt64\\bin\\libbrotlidec.dll",
    "C:\\msys64\\ucrt64\\bin\\libffi-8.dll",
    "C:\\msys64\\ucrt64\\bin\\libgmp-10.dll",
    "C:\\msys64\\ucrt64\\bin\\libintl-8.dll",
    "C:\\msys64\\ucrt64\\bin\\libopenjp2-7.dll",
    "C:\\msys64\\ucrt64\\bin\\libpng16-16.dll",
    "C:\\msys64\\ucrt64\\bin\\libstdc++-6.dll",
    "C:\\msys64\\ucrt64\\bin\\libvidstab.dll",
    "C:\\msys64\\ucrt64\\bin\\libxml2-2.dll",
    "C:\\msys64\\ucrt64\\bin\\avdevice-60.dll",
    "C:\\msys64\\ucrt64\\bin\\libbrotlienc.dll",
    "C:\\msys64\\ucrt64\\bin\\libfontconfig-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libgnutls-30.dll",
    "C:\\msys64\\ucrt64\\bin\\liblcms2-2.dll",
    "C:\\msys64\\ucrt64\\bin\\libopus-0.dll",
    "C:\\msys64\\ucrt64\\bin\\librsvg-2-2.dll",
    "C:\\msys64\\ucrt64\\bin\\libSvtAv1Enc.dll",
    "C:\\msys64\\ucrt64\\bin\\libvorbis-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libzimg-2.dll",
    "C:\\msys64\\ucrt64\\bin\\avfilter-9.dll",
    "C:\\msys64\\ucrt64\\bin\\libbz2-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libfreetype-6.dll",
    "C:\\msys64\\ucrt64\\bin\\libgobject-2.0-0.dll",
    "C:\\msys64\\ucrt64\\bin\\liblzma-5.dll",
    "C:\\msys64\\ucrt64\\bin\\libp11-kit-0.dll",
    "C:\\msys64\\ucrt64\\bin\\librtmp-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libtasn1-6.dll",
    "C:\\msys64\\ucrt64\\bin\\libvorbisenc-2.dll",
    "C:\\msys64\\ucrt64\\bin\\libzstd.dll",
    "C:\\msys64\\ucrt64\\bin\\avformat-60.dll",
    "C:\\msys64\\ucrt64\\bin\\libcaca-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libfribidi-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libgomp-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libmodplug-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libpango-1.0-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libshaderc_shared.dll",
    "C:\\msys64\\ucrt64\\bin\\libthai-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libvpl.dll",
    "C:\\msys64\\ucrt64\\bin\\postproc-57.dll",
    "C:\\msys64\\ucrt64\\bin\\avutil-58.dll",
    "C:\\msys64\\ucrt64\\bin\\libcairo-2.dll",
    "C:\\msys64\\ucrt64\\bin\\libgcc_s_seh-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libgraphite2.dll",
    "C:\\msys64\\ucrt64\\bin\\libmp3lame-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libpangocairo-1.0-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libsharpyuv-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libtheoradec-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libvpx-1.dll",
    "C:\\msys64\\ucrt64\\bin\\rav1e.dll",
    "C:\\msys64\\ucrt64\\bin\\dovi.dll",
    "C:\\msys64\\ucrt64\\bin\\libcairo-gobject-2.dll",
    "C:\\msys64\\ucrt64\\bin\\libgdk_pixbuf-2.0-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libgsm.dll",
    "C:\\msys64\\ucrt64\\bin\\libnettle-8.dll",
    "C:\\msys64\\ucrt64\\bin\\libpangoft2-1.0-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libsoxr.dll",
    "C:\\msys64\\ucrt64\\bin\\libtheoraenc-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libwebp-7.dll",
    "C:\\msys64\\ucrt64\\bin\\SDL2.dll",
    "C:\\msys64\\ucrt64\\bin\\libaom.dll",
    "C:\\msys64\\ucrt64\\bin\\libcrypto-3-x64.dll",
    "C:\\msys64\\ucrt64\\bin\\libgio-2.0-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libharfbuzz-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libogg-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libpangowin32-1.0-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libspeex-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libunibreak-5.dll",
    "C:\\msys64\\ucrt64\\bin\\libwebpmux-3.dll",
    "C:\\msys64\\ucrt64\\bin\\swresample-4.dll",
    "C:\\msys64\\ucrt64\\bin\\libass-9.dll",
    "C:\\msys64\\ucrt64\\bin\\libdatrie-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libglib-2.0-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libhogweed-6.dll",
    "C:\\msys64\\ucrt64\\bin\\libopenal-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libpcre2-8-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libspirv-cross-c-shared.dll",
    "C:\\msys64\\ucrt64\\bin\\libunistring-5.dll",
    "C:\\msys64\\ucrt64\\bin\\libwinpthread-1.dll",
    "C:\\msys64\\ucrt64\\bin\\swscale-7.dll",
    "C:\\msys64\\ucrt64\\bin\\libbluray-2.dll",
    "C:\\msys64\\ucrt64\\bin\\libdav1d-7.dll",
    "C:\\msys64\\ucrt64\\bin\\libgme.dll",
    "C:\\msys64\\ucrt64\\bin\\libiconv-2.dll",
    "C:\\msys64\\ucrt64\\bin\\libopencore-amrnb-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libpixman-1-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libsrt.dll",
    "C:\\msys64\\ucrt64\\bin\\libva.dll",
    "C:\\msys64\\ucrt64\\bin\\libx264-164.dll",
    "C:\\msys64\\ucrt64\\bin\\xvidcore.dll",
    "C:\\msys64\\ucrt64\\bin\\libbrotlicommon.dll",
    "C:\\msys64\\ucrt64\\bin\\libexpat-1.dll",
    "C:\\msys64\\ucrt64\\bin\\libgmodule-2.0-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libidn2-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libopencore-amrwb-0.dll",
    "C:\\msys64\\ucrt64\\bin\\libplacebo-338.dll",
    "C:\\msys64\\ucrt64\\bin\\libssh.dll",
    "C:\\msys64\\ucrt64\\bin\\libva_win32.dll",
    "C:\\msys64\\ucrt64\\bin\\libx265.dll",
    "C:\\msys64\\ucrt64\\bin\\zlib1.dll",
    "../../target/release/WebView2Loader.dll" # from build
  ]

# run after build
def clean():
    for path in RESOURCES:
        path = Path(path)
        new_path = TARGET / path.name
        new_path.unlink()

    CONF.unlink()
    shutil.copy(CONF.with_suffix('.old.json'), CONF)    


# copy DLLs
for path in RESOURCES:
    path = Path(path)
    new_path = TARGET / path.name
    shutil.copy(path, new_path)

# config environment
env = os.environ.copy()
env["PATH"] = f'C:\\Program Files\\Nodejs;{env["PATH"]}'

# config tauri.conf.json
shutil.copy(CONF, CONF.with_suffix('.old.json'))
with open(CONF, 'r') as f:
    webview_dll = TARGET / 'target/release/WebView2Loader.dll'
    data = json.load(f)
    data['tauri']['bundle']['resources'] = [Path(i).name for i in RESOURCES]
with open(CONF, 'w') as f:
    json.dump(data, f)

# build
try:
    result = subprocess.run('cargo tauri build', shell=True, check=True, env=env)
finally:
    clean()


