<!-- source: 9ffa119e9212 -->

# 🌟 Modely Vibe 🌟

Modely, které Vibe doporučuje, najdete nově na [stránce Modely](/vibe/models). Vyberte tam jazyk svých nahrávek a poté pomocí „Otevřít ve Vibe“ nainstalujte model jedním kliknutím, nebo pomocí „Kopírovat odkaz“ vložte jeho odkaz ke stažení do nastavení Vibe.

### Chcete více?

Další modely najdete zde:

[👉 Zobrazit další modely](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Připravte si vlastní modely

<details>
<summary>Převod transformers do GGML</summary>

```console
# Nastavení prostředí
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
uv venv
uv pip install torch transformers huggingface_hub
huggingface-cli login --token "token" # https://huggingface.co/settings/tokens

# Převod a nahrání
git clone https://github.com/openai/whisper
git clone https://github.com/ggml-org/whisper.cpp
git clone https://huggingface.co/ivrit-ai/whisper-large-v3-turbo
uv run ./whisper.cpp/models/convert-h5-to-ggml.py ./whisper-large-v3-turbo/ ./whisper .
uv run huggingface-cli upload --repo-type model whisper-large-v3-turbo-ivrit ./ggml-model.bin ./ggml-model.bin

# Kvantizace
sudo apt install cmake build-essential -y
cd whisper.cpp
cmake -B build
cmake --build build --config Release
cd ..
./whisper.cpp/build/bin/quantize ggml-model.bin ./ggml-model.int8.bin q8_0 # fp32/fp16/q8_0/q5_0
```

</details>
