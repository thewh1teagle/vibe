# Install notes

## System requirements

Windows: Version `8` greater.

Hardware:
No special requirement. resource usage can be customized through advanced settings in main window.

Currenly, `MacOS` computers get the best performance since there's GPU optimizations.

### Error of `msvc140.dll` not found

Download and install [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## Manual Install 🛠️

`MacOS Apple silicon`: install `aarch64.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases) **Don't forget to right click and open from Applications once**

`MacOS Intel`: install `x64.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases) **Don't forget to right click and open from Applications once**

`Windows`: install `.exe` file from [releases](https://github.com/thewh1teagle/vibe/releases)

`Linux`: install `.deb` from [releases](https://github.com/thewh1teagle/vibe/releases) (`Arch` users can use [debtap](https://aur.archlinux.org/packages/debtap)

## Ubuntu

Download `deb` file and execute

```console
sudo apt install ./vibe*.deb
```

Currenly, listening for the audio file isn't supported on `Linux`

## Offline Setup

Offline installation with Vibe is easy: open the app, cancel the download, and navigate to the `Customize` section within settings.

## Unsupported CPUs

Some CPUs aren't support some features used by Whisper.

Please try to use the following install: [vibe_1.0.7_x64-setup_no_avx_fma_f16c.exe](https://github.com/thewh1teagle/vibe/releases/download/v1.0.7/vibe_1.0.7_x64-setup_no_avx_fma_f16c.exe)

## macOS with `coreml` for much faster transcribe (2-3x)

1. Download [ggml-medium-encoder.mlmodelc.zip](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-encoder.mlmodelc.zip?download=true)
2. Unzip it (double click)
3. Open models path from Vibe settings
4. Drag and drop the file `ggml-medium-encoder.mlmodelc` there
5. Transcribe some file. it will take 5 minutes to initiate once. then it will be fast.

## Nvidia

Nvidia receive incredible performance - one hour in 1-5 minutes!

Download from [vibe_1.0.9_x64-setup_nvidia_whisper_1.6.2.exe](https://github.com/thewh1teagle/vibe/releases/download/v1.0.9/vibe_1.0.9_x64-setup_nvidia_whisper_1.6.2.exe)
