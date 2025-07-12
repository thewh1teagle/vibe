# Troubleshoot vibe crash / error

Try the following, the more you try the better the chance we'll find the cause :)

1. Is the audio file valid? try with different one, eg. download [vibe/samples/single.wav](https://github.com/thewh1teagle/vibe/raw/main/samples/single.wav)
2. Do you have errors? report it with the 'report button'
3. Do you experience crash without errors? try to run from the terminal with logs enabled:
4. Do you use other model than the default one? Please use the default one that comes with Vibe when checking.

<details>
<summary>Windows</summary>

a. Open `cmd.exe`
b. Execute:

```console
taskkill /IM vibe.exe /F
set RUST_BACKTRACE=1
set RUST_LOG=vibe=debug,whisper_rs=debug
%localappdata%\vibe\vibe.exe
```

</details>

<details>
<summary>macOS</summary>

```console
RUST_LOG=vibe=debug,whisper_rs=debug RUST_BACKTRACE=1 /Applications/vibe.app/Contents/MacOS/vibe
```

</details>

<details>
<summary>Linux</summary>

Run it similar to macOS just change the path

</details>

Does it happens with original Whisper?

<details>

1. Download one of the `zip` files from [releases/tag/v1.6.0](https://github.com/ggerganov/whisper.cpp/releases/tag/v1.6.0) (Scroll down and choose `whisper-bin-x64.zip` in `Windows`
2. Extract them and open the folder, then open explorer in that folder and hit `Ctrl` + `l` in `explorer, type `cmd` and enter
3. Download [vibe/samples/single.wav](https://github.com/thewh1teagle/vibe/raw/main/samples/single.wav) and place it in the same folder (and check that the file is ok)
4. Try to transcribe by execute

```console
main.exe -m "%localappdata%\github.com.thewh1teagle.vibe\ggml-medium.bin" -f "samples_single.wav"
```

</details>

<details>
<summary>App crashing and no even errors!</summary>

In windows, open search menu and search for `Event Viewer`, choose `Windows Logs` -> `Application` and check if there's some error there

</details>

<details>
<summary>Find debug log file</summary>
If you can't open the app due to crash, try to check any logs in

macOS: `$HOME/Library/Application Support/github.com.thewh1teagle.vibe`

Windows: `%appdata%\github.com.thewh1teagle.vibe`

Linux: `~/.config/github.com/thewh1teagle.vibe`

</details>

<details>
<summary>Get OS information for posting in a bug</summary>

## Windows

1. Open `cmd.exe`
2. Execute the following

```console
winget install neofetch
neofetch
```

3. Copy and paste it in the issue

## macOS

```console
brew install neofetch
neofetch
```

## Linux

```console
sudo apt-get update
sudo apt install -y neofetch
neofetch
```

</details>

<details>
<summary>vulkan-1.dll or vcomp140.dll is missing</summary>

For `vcomp140.dll` install [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

For `vulkan-1.dll` install [VulkanRT-Installer.exe](https://sdk.lunarg.com/sdk/download/1.3.290.0/windows/VulkanRT-1.3.290.0-Installer.exe)

</details>

After you finished, share you results by opening [new issue](https://github.com/thewh1teagle/vibe/issues/new?assignees=octocat&labels=bug&projects=&template=bug_report.yaml&title=[Short+title]) or just comment in the issue.
