# Install notes 📝

<details>
<summary>System requirements 💻</summary>

Windows: Version `8` greater.

Hardware:
No special requirement. resource usage can be customized through advanced settings in main window.

Currently, `MacOS` computers get the best performance since there's GPU optimizations.

</details>

<details>
<summary>Nvidia 🚀</summary>

Nvidia's performance is incredible — transcribe 1 hour in just 1-5 minutes!

~Look for installers with `nvidia` in [vibe/releases/latest](https://github.com/thewh1teagle/vibe/releases/latest)~

~On Linux, you may also need to install [`cuda-toolkit`](https://developer.nvidia.com/cuda-downloads).~

Just install the regular installer.

</details>

<details>
<summary>AMD 🚀</summary>
~Only available under Linux!~

~Look for installers with `amd` in [vibe/releases/latest](https://github.com/thewh1teagle/vibe/releases/latest)~

~[`rocm toolkit`](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/) is strictly required at runtime.~

Just install the regular installer.

</details>

<details>
<summary>Speedup GPU in Windows 🚀</summary>

Sometimes Windows doesn't use the GPU although nvidia / vulkan is supported.
There's a potential fix in windows settings.

1. Hit `Win` + `R`
2. Type `ms-settings:display-advancedgraphics` and press `Enter`
3. Select `Browse`
4. Navigate to `vibe.exe` by pasting `%localappdata%\vibe` in the path address bar and press `Enter`
5. Select `vibe.exe`
6. Vibe added to the list. select `Options`
7. Select the best GPU option - high Performance
8. Save it
9. Restart Vibe

</details>

<details>
<summary>macOS with `coreml` for faster transcriptions (2-3x) 🌟</summary>

1. Download the matching `.mlcmodelc.zip` for your model from https://huggingface.co/ggerganov/whisper.cpp/tree/main
  * e.g. `ggml-medium-encoder.mlmodelc.zip` matches `ggml-medium-encoder.bin`
2. Open models path from Vibe settings
3. Drag and drop the `.mlcmodel.c` file into the models folder so that it is alongside the `.bin` file
3. Transcribe a file, the first time you use the model it will take longer as it is compiling the model. Every subsequent time it will be faster.

</details>

<details>
<summary>Ubuntu 🐧</summary>

Download `deb` file and execute

```console
sudo apt install ./vibe*.deb
```

Currenly, listening for the audio file isn't supported on `Linux`

In addition you may need to set this environment variable before start it

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

</details>

<details>

<summary>Manual Install 🛠️</summary>

`MacOS Apple silicon`: install `aarch64.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases) **Don't forget to right click and open from Applications once**

`MacOS Intel`: install `x64.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases) **Don't forget to right click and open from Applications once**

`Windows`: install `.exe` file from [releases](https://github.com/thewh1teagle/vibe/releases)

`Linux`: install `.deb` from [releases](https://github.com/thewh1teagle/vibe/releases) (`Arch` users can use [debtap](https://aur.archlinux.org/packages/debtap))

_All models available for manual install. see [Pre built models](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

</details>

<details>
<summary>Offline Setup 💾</summary>

Offline installation with Vibe is easy: open the app, cancel the download, and navigate to the `Customize` section within settings.

_All models available for manual install. see settings or [Pre built models](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

</details>

</details>

<details>
<summary>Error of `msvc140.dll` not found ❌</summary>

Download and install [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

</details>

<details>
	<summary>Unsupported CPU</summary>

Some CPUs aren't support some features used by Whisper.

Please try to download and install the release file named with `older-cpu.exe`: [Vibe releases](https://github.com/thewh1teagle/vibe/releases/latest)

</details>

<details>
	<summary>Special link to download models in vibe</summary>

You can add links to your websites for letting users download your models easily from your website directly to vibe.

The URL should be like

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

</details>

<details>
	<summary>Install on Windows 7</summary>

**There's no support for Windows 7**

</details>

<details>
<summary>Usage on linux server</summary>

To use Vibe on linux server you need to install fake display

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/samples/single.wav
vibe --model ggml-medium.bin --file single.wav
```

</details>
