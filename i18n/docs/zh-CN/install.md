<!-- source: 664188849caa -->

# 安装说明 📝

## 系统要求

Windows：`8` 或更高版本。

macOS：`13.3` 或更高版本。

Linux：已在 `ubuntu-22.04+` 上测试

硬件：
无特殊要求，资源占用可以通过主窗口中的高级设置进行自定义。

目前，`Linux` 上不支持监听音频文件

此外，启动前你可能需要设置以下环境变量

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## 使用 Ollama 设置摘要功能

1. 安装 Ollama

从 https://ollama.com 下载并安装 Ollama。

2. 安装模型

安装完成后，设置一个用于摘要的模型。例如，你可以在终端中运行以下命令安装 `llama3.1`：

```console
ollama run llama3.1
```

3. 启用摘要功能

模型安装完成后，打开 Ollama 应用，进入更多选项，并在转录步骤之前启用总结。你可以保留默认设置。

_请确保运行「运行检查」，确认它可以正常工作_

就是这样！摘要功能现在已经在 Ollama 中启用。

## 稳定时间戳（字幕 / 影片）

Vibe 内置了稳定时间戳模式，可为长内容提供更精准的字幕时间。

1. 打开`更多选项`。
2. 启用`稳定时间戳`。
3. 如果出现提示，下载 VAD 模型。

说明：

- 此模式以质量优先，通常比正常转录慢约 `4x`。
- 最适合用于制作字幕以及影片/视频转录的时间校准。
- 默认使用的 VAD 模型：`ggml-silero-v6.2.0.bin`
- 上游模型来源：`https://huggingface.co/ggml-org/whisper-vad`

## 翻译为英语

翻译为英语功能仅支持 Whisper 的 `small`、`medium` 和 `large` 模型，不支持 Whisper 的 `large-v3-turbo`。

如果需要翻译功能，请从[模型文档](/vibe/docs#models)下载受支持的模型。

## 手动安装 🛠️

`MacOS Apple silicon`：从[发布页面](https://github.com/thewh1teagle/vibe/releases)安装 `aarch64.dmg` 文件 **首次打开时别忘了在“应用程序”中右键点击并打开**

`MacOS Intel`：从[发布页面](https://github.com/thewh1teagle/vibe/releases)安装 `x64.dmg` 文件 **首次打开时别忘了在“应用程序”中右键点击并打开**

`Windows`：从[发布页面](https://github.com/thewh1teagle/vibe/releases)安装 `.exe` 文件

`Linux`：从[发布页面](https://github.com/thewh1teagle/vibe/releases)安装 `.deb` 文件（`Arch` 用户可以使用 [debtap](https://aur.archlinux.org/packages/debtap)）

_所有模型均支持手动安装，参见[预构建模型](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## 离线设置 💾

使用 Vibe 进行离线安装很简单：打开应用，取消下载，然后进入设置中的`自定义`部分。

_所有模型均支持手动安装，参见设置或[预构建模型](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## macOS 上更快的转录速度（2-3x）🌟

1. 从 https://huggingface.co/ggerganov/whisper.cpp/tree/main 下载与你的模型匹配的 `.mlcmodelc.zip`

- 例如，`ggml-medium-encoder.mlmodelc.zip` 对应 `ggml-medium-encoder.bin`

2. 从 Vibe 设置中打开模型路径
3. 将 `.mlcmodel.c` 文件拖放到模型文件夹中，使其与 `.bin` 文件放在一起
4. 转录一个文件，首次使用该模型时耗时会更长，因为它正在编译模型。之后每次都会更快。

## 找不到 `msvc140.dll` 的错误 ❌

下载并安装 [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## 在 Vibe 中下载模型的特殊链接

你可以在自己的网站上添加链接，让用户可以直接从你的网站将模型下载到 Vibe 中。

链接格式应类似于

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## 在 Linux 服务器上使用

要在 Linux 服务器上使用 Vibe，你需要安装虚拟显示器

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
