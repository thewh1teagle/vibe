# 🌟 Vibe Models 🌟

Welcome to the Vibe Models page! Here you can find a curated list of suggested models to use with Vibe. To install a model, use the "Magic Setup" link to open it in Vibe, or copy and paste the direct download link in Vibe settings.

## Available Models

### 🌱 Tiny Model

A compact and efficient version, suitable for quick tasks and limited-resource environments.

[👉 Magic Setup](https://shorturl.at/XSP9R)  
[🔽 Direct Download](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true)

### 🌿 Small Model

A small yet capable model for a balance of efficiency and performance.

[👉 Magic Setup](https://shorturl.at/EmJS8)  
[🔽 Direct Download](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true)

### ⚖️ Medium Model

Balances performance and resource usage, making it ideal for most general applications.

[👉 Magic Setup](https://shorturl.at/Ha6br)  
[🔽 Direct Download](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true)

### 🚀 Large Model (v3)

For high accuracy and more computational resources, excels in complex scenarios.

[👉 Magic Setup](https://tinyurl.com/3cn846h8)  
[🔽 Direct Download](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin?download=true)

### 🚀 Distil Large Model (v3)

A highly optimized version of the large model, designed for English. It offers 2-3x faster performance compared to the standard large model while maintaining high accuracy.

[🔽 Direct Download](https://huggingface.co/distil-whisper/distil-large-v3-ggml/resolve/main/ggml-distil-large-v3.bin?download=true)

### ✡️ Ivrit Model (v2 d3 e3)

Specialized for Hebrew (Ivrit) language data, optimized for high accuracy in Hebrew tasks.

[👉 Magic Setup](https://tinyurl.com/yckxca25)  
[🔽 Direct Download](https://huggingface.co/ivrit-ai/whisper-v2-d3-e3-ggml/resolve/main/ggml-ivrit-v2-d3-e3.bin?download=true)

Enjoy exploring these models and enhancing your Vibe! 🌐✨

### Want More?

Find additional models here:

[👉 See More Models](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

Prepare your own models

<details>
<summary>Convert transformers to GGML</summary>

```console
mkdir whisper
cd whisper

python3 -m venv venv
source venv/bin/activate
pip3 install torch torchvision torchaudio transformers

git clone https://github.com/openai/whisper --depth 1
git clone https://github.com/ggerganov/whisper.cpp --depth 1

# Prepare whisper-tiny for conversion
git clone https://huggingface.co/openai/whisper-tiny --depth 1
python3 ./whisper.cpp/models/convert-h5-to-ggml.py ./whisper-tiny/ ./whisper .
mv ggml-model.bin ggml-tiny.bin
```

</details>
