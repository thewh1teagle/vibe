# Vibe

[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opencollective.com/tauri)
[![Discord](https://img.shields.io/badge/chat-discord-7289da.svg)](https://discord.gg/EcxWSstQN8)

Transcribe audio in every language

<img width=600 src="https://github.com/thewh1teagle/vibe/assets/61390950/22779ac6-9e49-4c21-b528-29647f039da2">

# Downloads ⬇️

Download at <a href="https://thewh1teagle.github.io/vibe" target="_blank">github.io/vibe</a>

# Supported platforms 🖥️

`MacOS`
`Windows`
`Linux`

# Features 🌟

- 🌍 Transcribe almost every language
- 📴 Works offline, no data sent out
- 🎨 User friendly design
- 🎙️ Transcribe audio / video
- 📂 Batch transcribe multiple files!
- 📝 Support `SRT`, `VTT`, `TXT`, `HTML`, `PDF` formats
- 👀 Realtime preview
- 🖨️ Print transcript directly to any printer
- 🔄 Automatic updates
- 🌐 Automatic translation
- 🖥️ Optimized for `CPU` on (`Windows` / `Linux`)
- 💻 Optimized for `GPU` (`macOS`, `Windows`)
- 🎮 Optimized for `Nvidia` GPUs! (see https://github.com/thewh1teagle/vibe/issues/79#issuecomment-2126031947)
- 🔧 Total Freedom: Customize Models Easily via Settings
- ⚙️ Model arguments for advanced users
- ⏳ ~Transcribe system audio~ 🕒 Coming soon!
- 🎤 ~Transcribe from microphone~ 🕒 Coming soon!

# Install notes

## System requirements

Windows: Version `8` greater.

Hardware:
No special requirement. resource usage can be customized through advanced settings in main window.

Currenly, `MacOS` computers get the best performance since there's GPU optimizations.

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

# Contribute 🤝

PRs are welcomed!
In addition, you're welcome to add translations.

We would like to express our sincere gratitude to all the contributors.

<a href="https://github.com/thewh1teagle/vibe/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=thewh1teagle/vibe" />
</a>

# Community

[![Discord](https://img.shields.io/badge/chat-discord-7289da.svg)](https://discord.gg/EcxWSstQN8)

# Roadmap 🛣️

You can see the roadmap in [Vibe-Roadmap](https://github.com/users/thewh1teagle/projects/5/views/1)

# Add translation 🌐

1. Copy `en` from `desktop/src-tauri/locales` folder to new directory eg `pt-BR` (use [bcp47 language code](https://gist.github.com/thewh1teagle/c8877e5c4c5e2780754ddd065ae2592e))
2. Change every value in the files there, to the new language and keep the keys as is
3. create PR / issue in Github

In addition you can add translation to [Vibe website](https://thewh1teagle.github.io/vibe/) by creating new files in the `landing/static/locales`.

# Build 🛠️

see [BUILDING.md](BUILDING.md)

# I want to know more!

Medium [post](https://medium.com/@thewh1teagle/creating-vibe-multilingual-audio-transcription-872ab6d9dbb0)

# Issue report

You can open [new issue](https://github.com/thewh1teagle/vibe/issues/new?assignees=octocat&labels=bug&projects=&template=bug_report.yaml&title=%5BBug%5D%3A+) and it's recommend to check [DEBUG.md](DEBUG.md) first.

# Credits

Thanks for [tauri.app](https://tauri.app/) for making the best apps framework I ever seen

Thanks for [wang-bin/avbuild](https://github.com/wang-bin/avbuild) for pre built `ffmpeg`

Thanks for [github.com/whisper.cpp](https://github.com/ggerganov/whisper.cpp) for outstanding interface for the AI model.

Thanks for [openai.com](https://openai.com/) for their amazing [Whisper model](https://openai.com/research/whisper)

Thanks for [github.com](https://github.com/) for their support in open source projects, providing infastructure completly free.

And for all the amazing open source frameworks and libraries which this project uses...
