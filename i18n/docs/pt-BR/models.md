<!-- source: 9ffa119e9212 -->

# 🌟 Modelos do Vibe 🌟

Os modelos que o Vibe sugere agora ficam na [página de Modelos](/vibe/models). Escolha lá o idioma das suas gravações e use "Abrir no Vibe" para instalar um modelo com um clique, ou "Copiar link" para colar o link de download nas configurações do Vibe.

### Quer mais?

Encontre mais modelos aqui:

[👉 Ver mais modelos](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Prepare seus próprios modelos

<details>
<summary>Converter transformers para GGML</summary>

```console
# Configurar o ambiente
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
uv venv
uv pip install torch transformers huggingface_hub
huggingface-cli login --token "token" # https://huggingface.co/settings/tokens

# Converter e enviar
git clone https://github.com/openai/whisper
git clone https://github.com/ggml-org/whisper.cpp
git clone https://huggingface.co/ivrit-ai/whisper-large-v3-turbo
uv run ./whisper.cpp/models/convert-h5-to-ggml.py ./whisper-large-v3-turbo/ ./whisper .
uv run huggingface-cli upload --repo-type model whisper-large-v3-turbo-ivrit ./ggml-model.bin ./ggml-model.bin

# Quantizar
sudo apt install cmake build-essential -y
cd whisper.cpp
cmake -B build
cmake --build build --config Release
cd ..
./whisper.cpp/build/bin/quantize ggml-model.bin ./ggml-model.int8.bin q8_0 # fp32/fp16/q8_0/q5_0
```

</details>
