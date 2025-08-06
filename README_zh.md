<p align="center">
  <a target="blank" href="https://github.com/thewh1teagle/vibe">
    <img
        width="96px"
        alt="Vibe 标志"
        src="./design/logo.png"
    />
  </a>
</p>

<p align="center">
  本文档亦提供以下语言版本: <a href="README.md">English</a>
</p>

<h1 align="center">Vibe - 在您自己的设备上转录！</h1>

<p align="center">
  <strong>⌨️ 使用 OpenAI Whisper 离线转录音频/视频</strong>
  <br/>
</p>

<p align="center">
  <a target="_blank" href="https://thewh1teagle.github.io/vibe/">
    🔗 下载 Vibe
  </a>
    &nbsp; | &nbsp; 给它一个 ⭐ | &nbsp;
    <a target="_blank" href="https://thewh1teagle.github.io/vibe/?action=support-vibe">支持项目 🤝</a>
</p>

<hr />

## 截图

<p align="center">
	<a target="_blank" href="https://thewh1teagle.github.io/vibe/">
    	<img width=600 src="https://github.com/thewh1teagle/vibe/assets/61390950/22779ac6-9e49-4c21-b528-29647f039da2">
	</a>
</p>

# 功能 🌟

-   🌍 转录几乎所有语言
-   🔒 极致隐私：完全离线转录，数据绝不离开您的设备
-   🎨 用户友好的设计
-   🎙️ 转录音频/视频
-   🎶 可选择从热门网站（YouTube、Vimeo、Facebook、Twitter 等）转录音频！
-   📂 批量转录多个文件！
-   📝 支持 `SRT`、`VTT`、`TXT`、`HTML`、`PDF`、`JSON`、`DOCX` 格式
-   👀 实时预览
-   ✨ 总结转录稿：使用 Claude API 获取快速、多语言的摘要
-   🧠 Ollama 支持：使用 Ollama 进行本地 AI 分析和批量摘要
-   🌐 从任何语言翻译成英语
-   🖨️ 直接将转录稿打印到任何打印机
-   🔄 自动更新
-   💻 针对 `GPU` 进行优化（`macOS`、`Windows`、`Linux`）
-   🎮 针对 `Nvidia` / `AMD` / `Intel` GPU 进行优化！（`Vulkan`/`CoreML`）
-   🔧 完全自由：通过设置轻松自定义模型
-   ⚙️ 为高级用户提供模型参数
-   ⏳ 转录系统音频
-   🎤 从麦克风转录
-   🖥️ CLI 支持：直接从命令行界面使用 Vibe！（请参阅 `--help`）
-   👥 说话人分离
-   📱 ~iOS 和 Android 支持~（即将推出）
-   📥 从您自己的站点集成自定义模型：使用 `vibe://download/?url=<模型 url>`
-   📹 选择针对视频/短视频优化的字幕长度
-   ⚡ 带有 Swagger 文档的 HTTP API！（使用 `--server` 并打开 `http://<host>:3022/docs` 查看文档）

# 支持的平台 🖥️

`MacOS`
`Windows`
`Linux`

# 贡献 🤝

欢迎提交 PR！
此外，也欢迎您添加翻译。

我们衷心感谢所有贡献者。

<a href="https://github.com/thewh1teagle/vibe/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=thewh1teagle/vibe" />
</a>

# 社区

[![Discord](https://img.shields.io/badge/chat-discord-7289da.svg)](https://discord.gg/EcxWSstQN8)

# 路线图 🛣️

您可以在 [Vibe-Roadmap](https://github.com/users/thewh1teagle/projects/5/views/1) 中查看路线图

# 添加翻译 🌐

1. 将 `desktop/src-tauri/locales` 文件夹中的 `en` 复制到新目录，例如 `pt-BR`（使用 [bcp47 语言代码](https://gist.github.com/thewh1teagle/c8877e5c4c5e2780754ddd065ae2592e)）
2. 将文件中每个值更改为新语言，并保持键不变
3. 在 Github 中创建 PR / issue

此外，您可以通过在 `landing/static/locales` 中创建新文件来为 [Vibe 网站](https://thewh1teagle.github.io/vibe/) 添加翻译。

# 文档 📄

请参阅 [Vibe 文档](https://github.com/thewh1teagle/vibe/tree/main/docs)

# 我想了解更多！

Medium [文章](https://medium.com/@thewh1teagle/creating-vibe-multilingual-audio-transcription-872ab6d9dbb0)

# 问题报告

您可以开启一个 [新 issue](https://github.com/thewh1teagle/vibe/issues/new?assignees=octocat&labels=bug&projects=&template=bug_report.yaml&title=[Short+title])，建议先查看 [debug.md](docs/debug.md)。

# 隐私政策 🔒

您的隐私对我们很重要。请查看我们的 [隐私政策](http.thewh1teagle.github.io/vibe/?action=open-privacy-policy) 以了解我们如何处理您的数据。

# 致谢

感谢 [tauri.app](https://tauri.app/) 制作了我见过的最好的应用程序框架

感谢 [wang-bin/avbuild](https://github.com/wang-bin/avbuild) 提供预构建的 `ffmpeg`

感谢 [github.com/whisper.cpp](https://github.com/ggerganov/whisper.cpp) 为 AI 模型提供了出色的界面。

感谢 [openai.com](https://openai.com/) 提供了他们出色的 [Whisper 模型](https://openai.com/research/whisper)

感谢 [github.com](https://github.com/) 对开源项目的支持，完全免费地提供了基础设施。

以及本项目使用的所有出色的开源框架和库...