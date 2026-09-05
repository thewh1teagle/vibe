<!-- source: 664188849caa -->

# 安裝須知 📝

## 系統需求

Windows：`8` 或以上版本。

macOS：`13.3` 或以上版本。

Linux：已在 `ubuntu-22.04+` 上測試。

硬件：
沒有特別要求，資源使用量可以在主視窗的進階設定中自訂。

目前 `Linux` 上不支援收聽音訊檔案。

另外，啟動前你可能需要設定以下環境變數。

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## 設定 Ollama 摘要功能

1. 安裝 Ollama

從 https://ollama.com 下載並安裝 Ollama。

2. 安裝模型

安裝完成後，設定一個用作摘要的模型。例如，你可以在終端機執行以下指令來安裝 `llama3.1`：

```console
ollama run llama3.1
```

3. 啟用摘要功能

安裝模型後，打開 Ollama 應用程式。前往「更多選項」，並在轉錄步驟之前啟用「摘要」。其他設定可保留預設值。

_請記得執行「Run check」以確認功能正常_

就是這樣！Ollama 摘要功能現已生效。

## 穩定時間戳（字幕／電影）

Vibe 提供穩定時間戳模式，適合長篇內容中更精準的字幕時間對齊。

1. 打開 `更多選項`。
2. 啟用 `穩定時間戳`。
3. 如有提示，下載 VAD 模型。

備註：

- 此模式以品質優先，速度通常比一般轉錄慢約 `4` 倍。
- 最適合用於製作字幕和電影／影片的轉錄時間對齊。
- 預設使用的 VAD 模型：`ggml-silero-v6.2.0.bin`
- 上游模型來源：`https://huggingface.co/ggml-org/whisper-vad`

## 翻譯成英文

只有 Whisper `small`、`medium` 和 `large` 模型支援翻譯成英文，`large-v3-turbo` 不支援。

如需翻譯功能，請從[模型頁面](/vibe/docs#models)下載支援的模型。

## 手動安裝 🛠️

`MacOS Apple silicon`：從[發佈頁面](https://github.com/thewh1teagle/vibe/releases)安裝 `aarch64.dmg` 檔案。**記得第一次要用右鍵點擊並從應用程式打開**

`MacOS Intel`：從[發佈頁面](https://github.com/thewh1teagle/vibe/releases)安裝 `x64.dmg` 檔案。**記得第一次要用右鍵點擊並從應用程式打開**

`Windows`：從[發佈頁面](https://github.com/thewh1teagle/vibe/releases)安裝 `.exe` 檔案

`Linux`：從[發佈頁面](https://github.com/thewh1teagle/vibe/releases)安裝 `.deb` 檔案（`Arch` 使用者可以使用 [debtap](https://aur.archlinux.org/packages/debtap)）

_所有模型都可以手動安裝，參見[預先建置的模型](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## 離線設定 💾

使用 Vibe 進行離線安裝很簡單：打開應用程式，取消下載，然後前往設定內的 `自訂` 部分。

_所有模型都可以手動安裝，參見設定或[預先建置的模型](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## macOS 上更快的轉錄速度（2-3 倍）🌟

1. 從 https://huggingface.co/ggerganov/whisper.cpp/tree/main 下載與你模型相符的 `.mlcmodelc.zip`

- 例如 `ggml-medium-encoder.mlmodelc.zip` 對應 `ggml-medium-encoder.bin`

2. 從 Vibe 設定打開模型路徑
3. 將 `.mlcmodel.c` 檔案拖放到模型資料夾內，使其與 `.bin` 檔案放在一起
4. 轉錄一個檔案，第一次使用該模型時會需要較長時間，因為正在編譯模型。之後每次使用都會更快。

## `msvc140.dll` 找不到的錯誤 ❌

下載並安裝 [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## Vibe 專用的模型下載連結

你可以在自己的網站加入連結，讓使用者可以直接從你的網站下載模型到 Vibe。

網址格式應該像這樣：

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## 在 Linux 伺服器上使用

要在 Linux 伺服器上使用 Vibe，你需要安裝虛擬顯示器。

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
