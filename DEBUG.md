# Troubleshoot vibe crash / error

Try the following, the more you try the better the chance we'll find the cause :)

1. Is the audio file valid? try with different one, eg. download [vibe/samples/single.wav](https://github.com/thewh1teagle/vibe/raw/main/samples/single.wav)
2. Do you have errors? report it with the 'report button'
3. Do you experience crash without errors? try to run from the terminal with logs enabled:

<details>
<summary>Windows</summary>

a. Open `cmd.exe`
b. Execute:

```console
set RUST_BACKTRACE=1
set RUST_LOG=trace
%localappdata%\vibe\vibe.exe
```

</details>

<details>
<summary>macOS</summary>

```console
RUST_LOG=vibe=trace RUST_BACKTRACE=1 /Applications/vibe.app/Contents/MacOS/vibe
```

</details>

<details>
<summary>Linux</summary>

Run it similar to macOS just change the path

</details>

4. Does it happens with original Whisper?

1. Download one of the `zip` files from [releases/tag/v1.6.0](https://github.com/ggerganov/whisper.cpp/releases/tag/v1.6.0) (Scroll down and choose `whisper-bin-x64.zip` in `Windows`
1. Extract them and open the folder, then open explorer in that folder and hit `Ctrl` + `l` in `explorer, type `cmd` and enter
1. Download [vibe/samples/single.wav](https://github.com/thewh1teagle/vibe/raw/main/samples/single.wav) and place it in the same folder (and check that the file is ok)
1. Try to transcribe by execute

```console
main.exe -m "%localappdata%\github.com.thewh1teagle.vibe\ggml-medium.bin" -f "samples_single.wav"
```

After you finished, share you results by opening [new issue](https://github.com/thewh1teagle/vibe/issues/new?assignees=octocat&labels=bug&projects=&template=bug_report.yaml&title=%5BBug%5D%3A+) or just comment in the issue.

<details>
<summary>App crashing and no even errors!</summary>

In windows, open search menu and search for `Event Viewr`, choose `Windows Logs` -> `Application` and check if there's some error there

</details>

<details>
<summary>Find debug log file</summary>
If you can't open the app due to crash, try to check any logs in

macOS: `$HOME/Library/Application Support/github.com.thewh1teagle.vibe`

Windows: `%appdata%\github.com.thewh1teagle.vibe`

Linux: `~/.config/github.com/thewh1teagle.vibe`

</details>
