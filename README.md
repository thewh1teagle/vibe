

# Vibe 
<img src="https://github.com/thewh1teagle/vibe/assets/61390950/5992e90b-f602-4155-bfe2-ccec3ae4268a" width=80>


Transcribe audio in every language

<img src="https://github.com/thewh1teagle/vibe/assets/61390950/ece19b81-26c6-4c13-81de-33175bb898d9" width=600>

# Downloads ⬇️
`MacOS`: install `.dmg` file from [releases](https://github.com/thewh1teagle/vibe/releases)

`Windows`: install `.exe` file from [releases](https://github.com/thewh1teagle/vibe/releases)

`Linux`: install either `.deb` (recommend) or use `appImage` from [releases](https://github.com/thewh1teagle/vibe/releases) and follow

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


# Install notes
## System requirements
Windows: Version `8` greater.

Hardware:
No special requirement. resource usage can be customized through advanced settings in main window.

Currenly, `MacOS` computers get the best performance since there's GPU optimizations.

## Ubuntu
Please install the following packages
```console
sudo apt-get install ffmpeg libgcc-s1 libc6 zlib1g libselinux1 libpcre3 libbz2-1.0 liblzma5 libcap2 libexpat1 libgpg-error0 libdbus-1-3 libcom-err2 libc6 libncursesw6 libtinfo6 libpulse0 libc6 libkeyutils1 libc6
```
And for install the `deb` file -> download it and execute
```console
dpkg -i ./vibe*.deb
```
Currenly, listening for the audio file isn't supported on `Linux`
And using the `appImage` isn't recommended.

## Offline installation

1. Stop the program

2. Download it from [ggml-medium.bin](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true)

3. Place it in the folder `C:\Users\User\AppData\Local\github.com.thewh1teagle.vibe` With the exact name `ggml-medium.bin`

4. Start the program

And if the antivirus still block the model file, you can always exclude it from the antivirus.


# Contribute 🤝
PRs are welcomed!
In addition, you're welcome to add translations.

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
