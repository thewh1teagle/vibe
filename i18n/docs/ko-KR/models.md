<!-- source: 9ffa119e9212 -->

# 🌟 Vibe 모델 🌟

Vibe가 추천하는 모델은 이제 [모델 페이지](/vibe/models)에 있습니다. 그곳에서 녹음 언어를 고른 다음 "Vibe에서 열기"로 모델을 한 번에 설치하거나, "링크 복사"로 다운로드 링크를 복사해 Vibe 설정에 붙여넣으세요.

### 더 찾고 계신가요?

추가 모델은 여기에서 찾을 수 있습니다.

[👉 더 많은 모델 보기](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### 나만의 모델 준비하기

<details>
<summary>transformers를 GGML로 변환하기</summary>

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
