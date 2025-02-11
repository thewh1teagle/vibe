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

### ✡️ Ivrit Model (v3 Trubo)

Specialized for Hebrew (Ivrit) language data, optimized for high speed and accuracy in Hebrew tasks.

[👉 Magic Setup](https://tinyurl.com/t9r3tyxk)  
[🔽 Direct Download](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true)

### ✡️ Ivrit Model (v2 d4)

Specialized for Hebrew (Ivrit) language data, optimized for high accuracy in Hebrew tasks.

[👉 Magic Setup](https://tinyurl.com/2c3bzj2b)  
[🔽 Direct Download](https://huggingface.co/ivrit-ai/whisper-v2-d4-ggml/resolve/main/ggml-ivrit-v2-d4.bin?download=true)


Enjoy exploring these models and enhancing your Vibe! 🌐✨

### Want More?

Find additional models here:

[👉 See More Models](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Prepare your own models

<details>
<summary>Convert transformers to GGML</summary>

```console
# Create folder for the process
mkdir whisper
cd whisper

# Install dependencies
sudo apt-get install git-lfs python3.10-venv
python3 -m venv venv
source venv/bin/activate
pip3 install torch torchvision torchaudio transformers

# Prepare OpenAI repository and whisper.cpp
git clone https://github.com/openai/whisper --depth 1
git clone https://github.com/ggerganov/whisper.cpp --depth 1

# Prepare whisper-tiny for conversion
git clone https://huggingface.co/openai/whisper-tiny --depth 1
cd whisper-tiny
git-lfs pull
cd ..
# Convert safetensors to GGML
python3 ./whisper.cpp/models/convert-h5-to-ggml.py ./whisper-tiny/ ./whisper .
mv ggml-model.bin ggml-tiny.bin

# Optional: quantize model with Q8_0 method (int8)
sudo apt install build-essential make 
cd whisper.cpp
make -j quantize
cd ..
./whisper.cpp/quantize ggml-tiny.bin ggml-tiny.bin-q8_0.bin q8_0

# Optional: upload to hugginface
pip install -U "huggingface_hub[cli]"
huggingface-cli login
huggingface-cli upload thewh1teagle/ggml-tiny ./ggml-tiny.bin
```

</details>
