<!-- source: 9ffa119e9212 -->

# 🌟 Modèles Vibe 🌟

Les modèles suggérés par Vibe se trouvent désormais sur la [page des modèles](/vibe/models). Choisissez-y la langue de vos enregistrements, puis utilisez « Ouvrir dans Vibe » pour installer un modèle en un clic, ou « Copier le lien » pour coller son lien de téléchargement dans les paramètres de Vibe.

### Envie d’en voir plus ?

Retrouvez d’autres modèles ici :

[👉 Voir plus de modèles](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Préparer vos propres modèles

<details>
<summary>Convertir des transformers en GGML</summary>

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
