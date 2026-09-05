<!-- source: 1d964213251f -->

# 🌟 Vibe 模型 🌟

歡迎來到 Vibe 模型頁面！在這裡你可以找到一系列建議與 Vibe 搭配使用的模型。要安裝模型，可以使用「Magic Setup」連結在 Vibe 中打開，或是在 Vibe 設定中複製並貼上直接下載連結。

## 可用模型

### 🌱 Tiny 模型

輕巧高效的版本，適合快速任務和資源有限的環境。

[👉 Magic Setup](https://shorturl.at/XSP9R)  
[🔽 直接下載](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true)

### 🌿 Small 模型

小巧但實用的模型，兼顧效率與效能。

[👉 Magic Setup](https://shorturl.at/EmJS8)  
[🔽 直接下載](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true)

### ⚖️ Medium 模型

在效能與資源使用之間取得平衡，適合大多數一般用途。

[👉 Magic Setup](https://shorturl.at/Ha6br)  
[🔽 直接下載](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true)

### 🚀 Large 模型（v3）

高準確度，需要較多運算資源，擅長處理複雜場景。

[👉 Magic Setup](https://tinyurl.com/3cn846h8)  
[🔽 直接下載](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin?download=true)

### 🚀 Large v3 Turbo（推薦）

[👉 Magic Setup](https://tinyurl.com/yphwban5)  
[🔽 直接下載](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin)

### 🦜 Parakeet TDT 0.6B v3

支援串流，最適合用於聽寫。

[👉 查看模型](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/tree/main)  
[🔽 下載 Q4_K_M](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/resolve/main/parakeet-tdt-0.6b-v3-Q4_K_M.gguf?download=true)

### ⚡ Nemotron 3.5 ASR Streaming 0.6B

支援串流，最適合用於聽寫。

[👉 查看模型](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf)  
[🔽 下載 Q4_K_M](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf/resolve/main/nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf?download=true)

### 針對其他語言優化的模型

<details>
<summary>✡️ 希伯來文（Ivrit）</summary>

專為希伯來文（Ivrit）語言資料設計，針對希伯來文任務優化速度與準確度。

[👉 Magic Setup（Large v3 Turbo）](https://tinyurl.com/t9r3tyxk)  
[🔽 直接下載（Large v3 Turbo）](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true)

</details>

<details>
<summary>🇳🇴 挪威文</summary>
	
由[挪威國家圖書館 AI Lab](https://huggingface.co/NbAiLab) 針對挪威文優化。

[👉 Magic Setup（medium）](https://tinyurl.com/5wzb9ux8)  
[🔽 直接下載（medium）](https://huggingface.co/NbAiLab/nb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Magic Setup（large）](https://tinyurl.com/f228efbu)  
[🔽 直接下載（large）](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model.bin?download=true)

更多較小尺寸的模型可以在[他們的 huggingface 下載頁面](https://huggingface.co/NbAiLab/nb-whisper-large)找到。
找到你想要的尺寸後，下載 _ggml-model.bin_ 檔案，重新命名，然後放入 vibe 的模型資料夾。

</details>

<details>
<summary>🇸🇪 瑞典文</summary>

由[瑞典國家圖書館 Data Lab](https://huggingface.co/KBLab) 針對瑞典文優化。

[👉 Magic Setup（medium）](https://tinyurl.com/ynawnc33)  
[🔽 直接下載（medium）](https://huggingface.co/KBLab/kb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Magic Setup（large v3）](https://tinyurl.com/46dvpeky)  
[🔽 直接下載（large v3）](https://huggingface.co/KBLab/kb-whisper-large/blob/main/ggml-model.bin?download=true)

更多較小尺寸的模型可以在[他們的 huggingface 下載頁面](https://huggingface.co/KBLab/kb-whisper-large)找到。
找到你想要的尺寸後，下載 _ggml-model.bin_ 檔案，重新命名，然後放入 vibe 的模型資料夾。

</details>
</details>

盡情探索這些模型，提升你的 Vibe 體驗！🌐✨

### 想要更多？

在這裡找到更多模型：

[👉 查看更多模型](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### 準備你自己的模型

<details>
<summary>將 transformers 轉換為 GGML</summary>

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
