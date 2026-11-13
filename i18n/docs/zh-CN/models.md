<!-- source: 9ffa119e9212 -->

# 🌟 Vibe 模型 🌟

Vibe 推荐的模型现在都在[模型页面](/vibe/models)。在那里选择你的录音语言，然后使用“在 Vibe 中打开”一键安装模型，或使用“复制链接”，把下载链接粘贴到 Vibe 设置中。

### 想要更多？

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
