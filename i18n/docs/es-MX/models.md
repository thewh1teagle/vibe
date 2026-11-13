<!-- source: 9ffa119e9212 -->

# 🌟 Modelos de Vibe 🌟

Los modelos que Vibe sugiere ahora viven en la [página de Modelos](/vibe/models). Elige ahí el idioma de tus grabaciones y luego usa "Abrir en Vibe" para instalar un modelo con un clic, o "Copiar enlace" para pegar su enlace de descarga en la configuración de Vibe.

### ¿Quieres más?

Encuentra modelos adicionales aquí:

[👉 Ver más modelos](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Prepara tus propios modelos

<details>
<summary>Convertir transformers a GGML</summary>

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
