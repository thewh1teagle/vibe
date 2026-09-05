<!-- source: 1d964213251f -->

# 🌟 Vibe-modeller 🌟

Velkommen til Vibe-modeller-siden! Her finner du en utvalgt liste over anbefalte modeller til bruk med Vibe. For å installere en modell, bruk «Magic Setup»-lenken for å åpne den i Vibe, eller kopier og lim inn den direkte nedlastingslenken i Vibe-innstillingene.

## Tilgjengelige modeller

### 🌱 Tiny-modell

En kompakt og effektiv versjon, egnet for raske oppgaver og miljøer med begrensede ressurser.

[👉 Magic Setup](https://shorturl.at/XSP9R)  
[🔽 Direkte nedlasting](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true)

### 🌿 Small-modell

En liten, men dyktig modell som gir en god balanse mellom effektivitet og ytelse.

[👉 Magic Setup](https://shorturl.at/EmJS8)  
[🔽 Direkte nedlasting](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true)

### ⚖️ Medium-modell

Balanserer ytelse og ressursbruk, noe som gjør den ideell for de fleste generelle bruksområder.

[👉 Magic Setup](https://shorturl.at/Ha6br)  
[🔽 Direkte nedlasting](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true)

### 🚀 Large-modell (v3)

For høy nøyaktighet og med behov for mer beregningskraft, utmerker seg i komplekse scenarioer.

[👉 Magic Setup](https://tinyurl.com/3cn846h8)  
[🔽 Direkte nedlasting](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin?download=true)

### 🚀 Large v3 Turbo (Anbefalt)

[👉 Magic Setup](https://tinyurl.com/yphwban5)  
[🔽 Direkte nedlasting](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin)

### 🦜 Parakeet TDT 0.6B v3

Støtter streaming og er best egnet for diktering.

[👉 Vis modell](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/tree/main)  
[🔽 Last ned Q4_K_M](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/resolve/main/parakeet-tdt-0.6b-v3-Q4_K_M.gguf?download=true)

### ⚡ Nemotron 3.5 ASR Streaming 0.6B

Støtter streaming og er best egnet for diktering.

[👉 Vis modell](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf)  
[🔽 Last ned Q4_K_M](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf/resolve/main/nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf?download=true)

### Modeller optimalisert for andre språk

<details>
<summary>✡️ Hebraisk (Ivrit)</summary>

Spesialisert for hebraiske (ivrit) språkdata, optimalisert for høy hastighet og nøyaktighet i hebraiske oppgaver.

[👉 Magic Setup (Large v3 Turbo)](https://tinyurl.com/t9r3tyxk)  
[🔽 Direkte nedlasting (Large v3 Turbo)](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true)

</details>

<details>
<summary>🇳🇴 Norsk</summary>
	
Optimalisert for norsk av [AI-laben ved Nasjonalbiblioteket](https://huggingface.co/NbAiLab).

[👉 Magic Setup (medium)](https://tinyurl.com/5wzb9ux8)  
[🔽 Direkte nedlasting (medium)](https://huggingface.co/NbAiLab/nb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Magic Setup (large)](https://tinyurl.com/f228efbu)  
[🔽 Direkte nedlasting (large)](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model.bin?download=true)

Flere modeller i mindre størrelser er tilgjengelige via [deres huggingface-nedlastingsside](https://huggingface.co/NbAiLab/nb-whisper-large).  
Finn størrelsen du ønsker, last ned _ggml-model.bin_-filen, gi filen nytt navn, og plasser den i vibes modellmappe.

</details>

<details>
<summary>🇸🇪 Svensk</summary>

Optimalisert for svensk av [Data Lab ved Kungliga biblioteket i Sverige](https://huggingface.co/KBLab).

[👉 Magic Setup (medium)](https://tinyurl.com/ynawnc33)  
[🔽 Direkte nedlasting (medium)](https://huggingface.co/KBLab/kb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Magic Setup (large v3)](https://tinyurl.com/46dvpeky)  
[🔽 Direkte nedlasting (large v3)](https://huggingface.co/KBLab/kb-whisper-large/blob/main/ggml-model.bin?download=true)

Flere modeller i mindre størrelser er tilgjengelige via [deres huggingface-nedlastingsside](https://huggingface.co/KBLab/kb-whisper-large).  
Finn størrelsen du ønsker, last ned _ggml-model.bin_-filen, gi filen nytt navn, og plasser den i vibes modellmappe.

</details>
</details>

Kos deg med å utforske disse modellene og forbedre din Vibe-opplevelse! 🌐✨

### Vil du ha mer?

Finn flere modeller her:

[👉 Se flere modeller](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Forbered dine egne modeller

<details>
<summary>Konverter transformers til GGML</summary>

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
