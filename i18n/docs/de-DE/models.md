<!-- source: 9ffa119e9212 -->

# 🌟 Vibe-Modelle 🌟

Die von Vibe empfohlenen Modelle finden Sie jetzt auf der [Modelle-Seite](/vibe/models). Wählen Sie dort die Sprache Ihrer Aufnahmen und installieren Sie ein Modell mit „In Vibe öffnen“ in einem Klick, oder verwenden Sie „Link kopieren“, um den Download-Link in die Vibe-Einstellungen einzufügen.

### Mehr gewünscht?

Weitere Modelle finden Sie hier:

[👉 Weitere Modelle ansehen](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Eigene Modelle vorbereiten

<details>
<summary>Transformers in GGML konvertieren</summary>

```console
# Umgebung einrichten
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
uv venv
uv pip install torch transformers huggingface_hub
huggingface-cli login --token "token" # https://huggingface.co/settings/tokens

# Konvertieren und hochladen
git clone https://github.com/openai/whisper
git clone https://github.com/ggml-org/whisper.cpp
git clone https://huggingface.co/ivrit-ai/whisper-large-v3-turbo
uv run ./whisper.cpp/models/convert-h5-to-ggml.py ./whisper-large-v3-turbo/ ./whisper .
uv run huggingface-cli upload --repo-type model whisper-large-v3-turbo-ivrit ./ggml-model.bin ./ggml-model.bin

# Quantisieren
sudo apt install cmake build-essential -y
cd whisper.cpp
cmake -B build
cmake --build build --config Release
cd ..
./whisper.cpp/build/bin/quantize ggml-model.bin ./ggml-model.int8.bin q8_0 # fp32/fp16/q8_0/q5_0
```

</details>
