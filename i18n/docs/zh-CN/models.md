<!-- source: 1d964213251f -->

# 🌟 Vibe 模型 🌟

欢迎来到 Vibe 模型页面！在这里你可以找到一份精选的建议模型列表，供 Vibe 使用。要安装模型，可以使用“魔法安装”链接在 Vibe 中打开它，或者在 Vibe 设置中复制粘贴直接下载链接。

## 可用模型

### 🌱 Tiny 模型

体积小巧、效率高的版本，适合快速任务和资源有限的环境。

[👉 魔法安装](https://shorturl.at/XSP9R)  
[🔽 直接下载](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true)

### 🌿 Small 模型

小巧且能力出色的模型，在效率与性能之间取得平衡。

[👉 魔法安装](https://shorturl.at/EmJS8)  
[🔽 直接下载](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true)

### ⚖️ Medium 模型

兼顾性能和资源占用，非常适合大多数常规应用场景。

[👉 魔法安装](https://shorturl.at/Ha6br)  
[🔽 直接下载](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true)

### 🚀 Large 模型（v3）

追求高精度并需要更多计算资源，擅长处理复杂场景。

[👉 魔法安装](https://tinyurl.com/3cn846h8)  
[🔽 直接下载](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin?download=true)

### 🚀 Large v3 Turbo（推荐）

[👉 魔法安装](https://tinyurl.com/yphwban5)  
[🔽 直接下载](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin)

### 🦜 Parakeet TDT 0.6B v3

支持流式转录，最适合用于听写。

[👉 查看模型](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/tree/main)  
[🔽 下载 Q4_K_M](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/resolve/main/parakeet-tdt-0.6b-v3-Q4_K_M.gguf?download=true)

### ⚡ Nemotron 3.5 ASR Streaming 0.6B

支持流式转录，最适合用于听写。

[👉 查看模型](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf)  
[🔽 下载 Q4_K_M](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf/resolve/main/nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf?download=true)

### 针对其他语言优化的模型

<details>
<summary>✡️ 希伯来语（Ivrit）</summary>

针对希伯来语（Ivrit）数据专门优化，在希伯来语任务中兼具高速与高精度。

[👉 魔法安装（Large v3 Turbo）](https://tinyurl.com/t9r3tyxk)  
[🔽 直接下载（Large v3 Turbo）](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true)

</details>

<details>
<summary>🇳🇴 挪威语</summary>
	
由[挪威国家图书馆 AI 实验室](https://huggingface.co/NbAiLab)针对挪威语优化。

[👉 魔法安装（medium）](https://tinyurl.com/5wzb9ux8)  
[🔽 直接下载（medium）](https://huggingface.co/NbAiLab/nb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 魔法安装（large）](https://tinyurl.com/f228efbu)  
[🔽 直接下载（large）](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model.bin?download=true)

更多小尺寸的模型可通过[他们的 Hugging Face 下载页面](https://huggingface.co/NbAiLab/nb-whisper-large)获取。
找到你需要的尺寸，下载 _ggml-model.bin_ 文件，重命名后放入 Vibe 的模型文件夹中。

</details>

<details>
<summary>🇸🇪 瑞典语</summary>

由[瑞典国家图书馆数据实验室](https://huggingface.co/KBLab)针对瑞典语优化。

[👉 魔法安装（medium）](https://tinyurl.com/ynawnc33)  
[🔽 直接下载（medium）](https://huggingface.co/KBLab/kb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 魔法安装（large v3）](https://tinyurl.com/46dvpeky)  
[🔽 直接下载（large v3）](https://huggingface.co/KBLab/kb-whisper-large/blob/main/ggml-model.bin?download=true)

更多小尺寸的模型可通过[他们的 Hugging Face 下载页面](https://huggingface.co/KBLab/kb-whisper-large)获取。
找到你需要的尺寸，下载 _ggml-model.bin_ 文件，重命名后放入 Vibe 的模型文件夹中。

</details>
</details>

尽情探索这些模型，让你的 Vibe 更强大！🌐✨

### 还想要更多？

在这里查找更多模型：

[👉 查看更多模型](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### 准备你自己的模型

<details>
<summary>将 transformers 转换为 GGML</summary>

```console
# Setup environment
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
uv venv
uv pip install torch transformers huggingface_hub
huggingface-cli login --token "token" # https://huggingface.co/settings/tokens

# Convert and upload
git clone https://github.com/openai/whisper
git clone https://github.com/ggml-org/whisper.cpp
git clone https://huggingface.co/ivrit-ai/whisper-large-v3-turbo
uv run ./whisper.cpp/models/convert-h5-to-ggml.py ./whisper-large-v3-turbo/ ./whisper .
uv run huggingface-cli upload --repo-type model whisper-large-v3-turbo-ivrit ./ggml-model.bin ./ggml-model.bin

# Quantize
sudo apt install cmake build-essential -y
cd whisper.cpp
cmake -B build
cmake --build build --config Release
cd ..
./whisper.cpp/build/bin/quantize ggml-model.bin ./ggml-model.int8.bin q8_0 # fp32/fp16/q8_0/q5_0
```

</details>
