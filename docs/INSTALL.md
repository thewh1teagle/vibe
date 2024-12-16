# Install notes 📝

## System Requirements

Windows: Version `8` greater.

Hardware:
No special requirement. resource usage can be customized through advanced settings in main window.

## Ubuntu imstallation 🐧

Download `deb` file and execute

```console
sudo apt install ./vibe*.deb
```

Currenly, listening for the audio file isn't supported on `Linux`

In addition you may need to set this environment variable before start it

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## Manual Install 🛠️

`MacOS Apple silicon`: install `aarch64.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases) **Don't forget to right click and open from Applications once**

`MacOS Intel`: install `x64.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases) **Don't forget to right click and open from Applications once**

`Windows`: install `.exe` file from [releases](https://github.com/thewh1teagle/vibe/releases)

`Linux`: install `.deb` from [releases](https://github.com/thewh1teagle/vibe/releases) (`Arch` users can use [debtap](https://aur.archlinux.org/packages/debtap))

_All models available for manual install. see [Pre built models](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Offline Setup 💾

Offline installation with Vibe is easy: open the app, cancel the download, and navigate to the `Customize` section within settings.

_All models available for manual install. see settings or [Pre built models](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Faster transcriptions on macOS (2-3x) 🌟

1. Download the matching `.mlcmodelc.zip` for your model from https://huggingface.co/ggerganov/whisper.cpp/tree/main

-   e.g. `ggml-medium-encoder.mlmodelc.zip` matches `ggml-medium-encoder.bin`

2. Open models path from Vibe settings
3. Drag and drop the `.mlcmodel.c` file into the models folder so that it is alongside the `.bin` file
4. Transcribe a file, the first time you use the model it will take longer as it is compiling the model. Every subsequent time it will be faster.

## Setting Up Summarization with Ollama

1. Install Ollama

Download and install Ollama from https://ollama.com.

2. Install a Model

Once installed, set up a model for summarization. For example, you can install `llama3.1` by running the following command in your terminal:

```console
ollama run llama3.1
```

3. Enable Summarization

After the model is installed, open the Ollama app. Navigate to More Options and enable Summarize just before the transcription step. You can leave the settings at their default values.

That's it! Summarization will now be active in Ollama.

## Error of `msvc140.dll` not found ❌

Download and install [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## Special link to download models in vibe

You can add links to your websites for letting users download your models easily from your website directly to vibe.

The URL should be like

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## Usage on linux server

To use Vibe on linux server you need to install fake display

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/samples/single.wav
vibe --model ggml-medium.bin --file single.wav
```
