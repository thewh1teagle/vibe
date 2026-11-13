<!-- source: 9ffa119e9212 -->

# 🌟 Модели на Vibe 🌟

Моделите, които Vibe препоръчва, вече са на [страницата с модели](/vibe/models). Изберете там езика на записите си, после използвайте „Отваряне във Vibe“, за да инсталирате модел с едно щракване, или „Копиране на връзката“, за да поставите връзката за изтегляне в настройките на Vibe.

### Искате още?

Още модели ще намерите тук:

[👉 Вижте още модели](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Подгответе собствени модели

<details>
<summary>Преобразуване на transformers в GGML</summary>

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
