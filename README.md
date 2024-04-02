# Vibe

<img src="https://github.com/thewh1teagle/vibe/assets/61390950/5992e90b-f602-4155-bfe2-ccec3ae4268a" width=80>

Transcribe audio in every language

<img src="https://github.com/thewh1teagle/vibe/assets/61390950/ece19b81-26c6-4c13-81de-33175bb898d9" width=600>

# Downloads ⬇️
Download at <a href="https://thewh1teagle.github.io/vibe" target="_blank">github.io/vibe</a>

# Supported platforms 🖥️

`MacOS`
`Windows`
`Linux`

# Features 🌟

- Transcribe almost every language
- Works offline, no data sent out
- Easy to use
- Model parametrs for advanced users
- Optimized for `CPU` (`Windows` / `Linux`)
- Optmized for `GPU` (`MacOS`)
- Support `SRT`, `VTT` formats
- Transcribe audio / video
- Automatic updates

# Install notes

## System requirements

Windows: Version `8` greater.

Hardware:
No special requirement. resource usage can be customized through advanced settings in main window.

Currenly, `MacOS` computers get the best performance since there's GPU optimizations.

## Manual Install 🛠️

`MacOS Apple silicon`: install `aarch64.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases) **Don't forget to right click and open from launchpad once**

`MacOS Intel`: install `x64.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases) **Don't forget to right click and open from launchpad once**

`Windows`: install `.exe` file from [releases](https://github.com/thewh1teagle/vibe/releases)

`Linux`: install `.deb` (recommend) from [releases](https://github.com/thewh1teagle/vibe/releases) and follow install notes (`Arch` users can use [debtap](https://aur.archlinux.org/packages/debtap)


## Ubuntu

Download `deb` file and execute

```console
dpkg -i ./vibe*.deb
```

Currenly, listening for the audio file isn't supported on `Linux`

## Offline installation

1. Stop the program

2. Download it from [ggml-medium.bin](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true)

3. Place it in the folder `C:\Users\User\AppData\Local\github.com.thewh1teagle.vibe` With the exact name `ggml-medium.bin`

4. Start the program

And if the antivirus still block the model file, you can always exclude it from the antivirus.

# Contribute 🤝

PRs are welcomed!
In addition, you're welcome to add translations.

# Community

[Discord](https://discord.gg/2VWf5jB5)

# Roadmap 🛣️

You can see the roadmap in [Vibe-Roadmap](https://github.com/users/thewh1teagle/projects/5/views/1)

# Add translation 🌐

1. Copy `en.json` from `locales` folder
2. Create new file eg `ru.json`
3. Change every value to the new language and keep the keys as is
4. create PR / issue in github

# Build 🛠️

see [BUILDING.md](BUILDING.md)

# I want to know more!

Medium [post](https://medium.com/@thewh1teagle/creating-vibe-multilingual-audio-transcription-872ab6d9dbb0)

# Credits

Thanks for [tauri.app](https://tauri.app/) for making the best apps framework I ever seen

Thanks for [wang-bin/avbuild](https://github.com/wang-bin/avbuild) for pre built `ffmpeg`

Thanks for [github.com/whisper.cpp](https://github.com/ggerganov/whisper.cpp) for outstanding interface for the AI model.

Thanks for [openai.com](https://openai.com/) for their amazing [Whisper model](https://openai.com/research/whisper)

Thanks for [github.com](https://github.com/) for their support in open source projects, providing infastructure completly free.

And for all the amazing open source frameworks and libraries which this project uses...
