<!-- source: 9ffa119e9212 -->

# 🌟 Vibeモデル 🌟

Vibeがおすすめするモデルは、[モデルページ](/vibe/models)に移りました。そこで録音の言語を選び、「Vibeで開く」でワンクリックでモデルをインストールするか、「リンクをコピー」でダウンロードリンクをVibeの設定に貼り付けてください。

### さらに探したい方へ

こちらでさらに多くのモデルを見つけられます:

[👉 他のモデルを見る](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### 独自のモデルを準備する

<details>
<summary>TransformersをGGMLに変換する</summary>

```console
# 環境をセットアップ
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
uv venv
uv pip install torch transformers huggingface_hub
huggingface-cli login --token "token" # https://huggingface.co/settings/tokens

# 変換してアップロード
git clone https://github.com/openai/whisper
git clone https://github.com/ggml-org/whisper.cpp
git clone https://huggingface.co/ivrit-ai/whisper-large-v3-turbo
uv run ./whisper.cpp/models/convert-h5-to-ggml.py ./whisper-large-v3-turbo/ ./whisper .
uv run huggingface-cli upload --repo-type model whisper-large-v3-turbo-ivrit ./ggml-model.bin ./ggml-model.bin

# 量子化
sudo apt install cmake build-essential -y
cd whisper.cpp
cmake -B build
cmake --build build --config Release
cd ..
./whisper.cpp/build/bin/quantize ggml-model.bin ./ggml-model.int8.bin q8_0 # fp32/fp16/q8_0/q5_0
```

</details>
