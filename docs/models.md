# Modelos (RW Vibe)

Lista curada de modelos sugeridos para uso no RW Vibe. Para instalar um modelo, use o link “Magic Setup” (deep-link) para abrir no app, ou copie e cole o link direto de download nas configurações.

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

### 🚀 Large v3 Turbo (Recommended)

[👉 Magic Setup](https://tinyurl.com/yphwban5)  
[🔽 Direct Download](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin)

### Models optimised for other languages

<details>
<summary>✡️ Hebrew (Ivrit)</summary>

Specialized for Hebrew (Ivrit) language data, optimized for high speed and accuracy in Hebrew tasks.

[👉 Magic Setup (Large v3 Turbo)](https://tinyurl.com/t9r3tyxk)  
[🔽 Direct Download (Large v3 Turbo)](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true)

</details>

<details>
<summary>🇳🇴 Norwegian</summary>
	
Optimised for Norwegian by the [AI Lab at the National Library of Norway](https://huggingface.co/NbAiLab).

[👉 Magic Setup (medium)](https://tinyurl.com/5wzb9ux8)  
[🔽 Direct Download (medium)](https://huggingface.co/NbAiLab/nb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Magic Setup (large)](https://tinyurl.com/f228efbu)  
[🔽 Direct Download (large)](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model.bin?download=true)

More models of smaller sizes are available via [their huggingface download page](https://huggingface.co/NbAiLab/nb-whisper-large).  
Find the size you want, download the _ggml-model.bin_ file, rename the file, and place it in the RW Vibe model folder.

</details>

<details>
<summary>🇸🇪 Swedish</summary>

Optimised for Swedish by the [Data Lab at the National Library of Sweden](https://huggingface.co/KBLab).

[👉 Magic Setup (medium)](https://tinyurl.com/ynawnc33)  
[🔽 Direct Download (medium)](https://huggingface.co/KBLab/kb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Magic Setup (large v3)](https://tinyurl.com/46dvpeky)  
[🔽 Direct Download (large v3)](https://huggingface.co/KBLab/kb-whisper-large/blob/main/ggml-model.bin?download=true)

More models of smaller sizes are available via [their huggingface download page](https://huggingface.co/KBLab/kb-whisper-large).  
Find the size you want, download the _ggml-model.bin_ file, rename the file, and place it in the RW Vibe model folder.

</details>
</details>

Esses modelos ajudam a equilibrar qualidade, velocidade e consumo de recursos no RW Vibe.

### Want More?

Find additional models here:

[👉 See More Models](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Prepare your own models

<details>
<summary>Convert transformers to GGML</summary>

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
