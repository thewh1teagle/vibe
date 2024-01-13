import json
import os
import shutil
import subprocess
from pathlib import Path

TARGET = Path(__file__).parent
CONF = TARGET / 'tauri.conf.json'
RESOURCES = [f'C:\\msys64\\ucrt64\\bin\\{name}' for name in (
    # FFMPEG
    "avcodec-60.dll",
    "libbrotlidec.dll",
    "libffi-8.dll",
    "libgmp-10.dll",
    "libintl-8.dll",
    "libopenjp2-7.dll",
    "libpng16-16.dll",
    "libstdc++-6.dll",
    "libvidstab.dll",
    "libxml2-2.dll",
    "avdevice-60.dll",
    "libbrotlienc.dll",
    "libfontconfig-1.dll",
    "libgnutls-30.dll",
    "liblcms2-2.dll",
    "libopus-0.dll",
    "librsvg-2-2.dll",
    "libSvtAv1Enc.dll",
    "libvorbis-0.dll",
    "libzimg-2.dll",
    "avfilter-9.dll",
    "libbz2-1.dll",
    "libfreetype-6.dll",
    "libgobject-2.0-0.dll",
    "liblzma-5.dll",
    "libp11-kit-0.dll",
    "librtmp-1.dll",
    "libtasn1-6.dll",
    "libvorbisenc-2.dll",
    "libzstd.dll",
    "avformat-60.dll",
    "libcaca-0.dll",
    "libfribidi-0.dll",
    "libgomp-1.dll",
    "libmodplug-1.dll",
    "libpango-1.0-0.dll",
    "libshaderc_shared.dll",
    "libthai-0.dll",
    "libvpl.dll",
    "postproc-57.dll",
    "avutil-58.dll",
    "libcairo-2.dll",
    "libgcc_s_seh-1.dll",
    "libgraphite2.dll",
    "libmp3lame-0.dll",
    "libpangocairo-1.0-0.dll",
    "libsharpyuv-0.dll",
    "libtheoradec-1.dll",
    "libvpx-1.dll",
    "rav1e.dll",
    "dovi.dll",
    "libcairo-gobject-2.dll",
    "libgdk_pixbuf-2.0-0.dll",
    "libgsm.dll",
    "libnettle-8.dll",
    "libpangoft2-1.0-0.dll",
    "libsoxr.dll",
    "libtheoraenc-1.dll",
    "libwebp-7.dll",
    "SDL2.dll",
    "libaom.dll",
    "libcrypto-3-x64.dll",
    "libgio-2.0-0.dll",
    "libharfbuzz-0.dll",
    "libogg-0.dll",
    "libpangowin32-1.0-0.dll",
    "libspeex-1.dll",
    "libunibreak-5.dll",
    "libwebpmux-3.dll",
    "swresample-4.dll",
    "libass-9.dll",
    "libdatrie-1.dll",
    "libglib-2.0-0.dll",
    "libhogweed-6.dll",
    "libopenal-1.dll",
    "libpcre2-8-0.dll",
    "libspirv-cross-c-shared.dll",
    "libunistring-5.dll",
    "libwinpthread-1.dll",
    "swscale-7.dll",
    "libbluray-2.dll",
    "libdav1d-7.dll",
    "libgme.dll",
    "libiconv-2.dll",
    "libopencore-amrnb-0.dll",
    "libpixman-1-0.dll",
    "libsrt.dll",
    "libva.dll",
    "libx264-164.dll",
    "xvidcore.dll",
    "libbrotlicommon.dll",
    "libexpat-1.dll",
    "libgmodule-2.0-0.dll",
    "libidn2-0.dll",
    "libopencore-amrwb-0.dll",
    "libplacebo-338.dll",
    "libssh.dll",
    "libva_win32.dll",
    "libx265.dll",
    "zlib1.dll",
    # OpenBLAS
    "libopenblas.dll",
    "libgfortran-5.dll",
    "libquadmath-0.dll"
)]
# Webview2
RESOURCES.append("../../target/release/WebView2Loader.dll")

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
env["OPENBLAS_PATH"]=os.getenv("MINGW_PREFIX")

# config tauri.conf.json
shutil.copy(CONF, CONF.with_suffix('.old.json'))
with open(CONF, 'r') as f:
    webview_dll = TARGET / 'target/release/WebView2Loader.dll'
    data = json.load(f)
    data['tauri']['bundle']['resources'] = [Path(i).name for i in RESOURCES]
with open(CONF, 'w') as f:
    json.dump(data, f, indent=4)

# build
try:
    result = subprocess.run('cargo tauri build', shell=True, check=True, env=env)
finally:
    clean()


