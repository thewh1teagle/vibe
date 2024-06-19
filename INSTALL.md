# Install notes 📝

<details>
<summary>System requirements 💻</summary>

Windows: Version `8` greater.

Hardware:
No special requirement. resource usage can be customized through advanced settings in main window.

Currenly, `MacOS` computers get the best performance since there's GPU optimizations.

</details>

<details>
<summary>Nvidia 🚀</summary>

Nvidia's performance is incredible — transcribe 1 hour in just 1-5 minutes!

Look for installers with `nvidia` in [vibe/releases/latest](https://github.com/thewh1teagle/vibe/releases/latest)

</details>

<details>
<summary>macOS with `coreml` for faster transcribe (2-3x) 🌟</summary>

1. Download [ggml-medium-encoder.mlmodelc.zip](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-encoder.mlmodelc.zip?download=true)
2. Unzip it (double click)
3. Open models path from Vibe settings
4. Drag and drop the file `ggml-medium-encoder.mlmodelc` there
5. Transcribe some file. it will take 5 minutes to initiate once. then it will be fast.

</details>

<details>
<summary>Ubuntu 🐧</summary>

Download `deb` file and execute

```console
sudo apt install ./vibe*.deb
```

Currenly, listening for the audio file isn't supported on `Linux`

</details>

<details>

<summary>Manual Install 🛠️</summary>

`MacOS Apple silicon`: install `aarch64.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases) **Don't forget to right click and open from Applications once**

`MacOS Intel`: install `x64.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases) **Don't forget to right click and open from Applications once**

`Windows`: install `.exe` file from [releases](https://github.com/thewh1teagle/vibe/releases)

`Linux`: install `.deb` from [releases](https://github.com/thewh1teagle/vibe/releases) (`Arch` users can use [debtap](https://aur.archlinux.org/packages/debtap)

</details>

<details>
<summary>Offline Setup 💾</summary>

Offline installation with Vibe is easy: open the app, cancel the download, and navigate to the `Customize` section within settings.

</details>

</details>

<details>
<summary>Error of `msvc140.dll` not found ❌</summary>

Download and install [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

</details>

## Unsupported CPUs

Some CPUs aren't support some features used by Whisper.

Please try to download and install the release file named with `older-cpu.exe`: [Vibe releases](https://github.com/thewh1teagle/vibe/releases/latest)

## Link to download model

You can add links to your websites for letting users download your models easily from your website directly to vibe.

The URL should be like

```
vibe://download/?url=https://huggingface.co/ivrit-ai/whisper-v2-d3-e3
```
