<!-- source: 1d964213251f -->

# 🌟 Modelos do Vibe 🌟

Bem-vindo à página de Modelos do Vibe! Aqui você encontra uma lista selecionada de modelos sugeridos para usar com o Vibe. Para instalar um modelo, use o link "Configuração Mágica" para abri-lo no Vibe, ou copie e cole o link de download direto nas configurações do Vibe.

## Modelos disponíveis

### 🌱 Modelo Tiny

Uma versão compacta e eficiente, adequada para tarefas rápidas e ambientes com recursos limitados.

[👉 Configuração Mágica](https://shorturl.at/XSP9R)  
[🔽 Download Direto](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true)

### 🌿 Modelo Small

Um modelo pequeno, porém capaz, com um bom equilíbrio entre eficiência e desempenho.

[👉 Configuração Mágica](https://shorturl.at/EmJS8)  
[🔽 Download Direto](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true)

### ⚖️ Modelo Medium

Equilibra desempenho e uso de recursos, sendo ideal para a maioria das aplicações gerais.

[👉 Configuração Mágica](https://shorturl.at/Ha6br)  
[🔽 Download Direto](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true)

### 🚀 Modelo Large (v3)

Para alta precisão e maior uso de recursos computacionais, se destaca em cenários complexos.

[👉 Configuração Mágica](https://tinyurl.com/3cn846h8)  
[🔽 Download Direto](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin?download=true)

### 🚀 Large v3 Turbo (Recomendado)

[👉 Configuração Mágica](https://tinyurl.com/yphwban5)  
[🔽 Download Direto](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin)

### 🦜 Parakeet TDT 0.6B v3

Suporta streaming e é o mais indicado para ditado.

[👉 Ver Modelo](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/tree/main)  
[🔽 Baixar Q4_K_M](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/resolve/main/parakeet-tdt-0.6b-v3-Q4_K_M.gguf?download=true)

### ⚡ Nemotron 3.5 ASR Streaming 0.6B

Suporta streaming e é o mais indicado para ditado.

[👉 Ver Modelo](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf)  
[🔽 Baixar Q4_K_M](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf/resolve/main/nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf?download=true)

### Modelos otimizados para outros idiomas

<details>
<summary>✡️ Hebraico (Ivrit)</summary>

Especializado em dados do idioma hebraico (Ivrit), otimizado para alta velocidade e precisão em tarefas em hebraico.

[👉 Configuração Mágica (Large v3 Turbo)](https://tinyurl.com/t9r3tyxk)  
[🔽 Download Direto (Large v3 Turbo)](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true)

</details>

<details>
<summary>🇳🇴 Norueguês</summary>
	
Otimizado para o norueguês pelo [AI Lab da Biblioteca Nacional da Noruega](https://huggingface.co/NbAiLab).

[👉 Configuração Mágica (medium)](https://tinyurl.com/5wzb9ux8)  
[🔽 Download Direto (medium)](https://huggingface.co/NbAiLab/nb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Configuração Mágica (large)](https://tinyurl.com/f228efbu)  
[🔽 Download Direto (large)](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model.bin?download=true)

Mais modelos de tamanhos menores estão disponíveis na [página de downloads deles no huggingface](https://huggingface.co/NbAiLab/nb-whisper-large).  
Encontre o tamanho desejado, baixe o arquivo _ggml-model.bin_, renomeie o arquivo e coloque-o na pasta de modelos do vibe.

</details>

<details>
<summary>🇸🇪 Sueco</summary>

Otimizado para o sueco pelo [Data Lab da Biblioteca Nacional da Suécia](https://huggingface.co/KBLab).

[👉 Configuração Mágica (medium)](https://tinyurl.com/ynawnc33)  
[🔽 Download Direto (medium)](https://huggingface.co/KBLab/kb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Configuração Mágica (large v3)](https://tinyurl.com/46dvpeky)  
[🔽 Download Direto (large v3)](https://huggingface.co/KBLab/kb-whisper-large/blob/main/ggml-model.bin?download=true)

Mais modelos de tamanhos menores estão disponíveis na [página de downloads deles no huggingface](https://huggingface.co/KBLab/kb-whisper-large).  
Encontre o tamanho desejado, baixe o arquivo _ggml-model.bin_, renomeie o arquivo e coloque-o na pasta de modelos do vibe.

</details>
</details>

Aproveite para explorar esses modelos e aprimorar seu Vibe! 🌐✨

### Quer mais?

Encontre modelos adicionais aqui:

[👉 Ver Mais Modelos](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Prepare seus próprios modelos

<details>
<summary>Converter transformers para GGML</summary>

```console
# Configurar ambiente
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
