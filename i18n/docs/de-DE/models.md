<!-- source: 1d964213251f -->

# 🌟 Vibe-Modelle 🌟

Willkommen auf der Vibe-Modelle-Seite! Hier finden Sie eine kuratierte Liste empfohlener Modelle für die Verwendung mit Vibe. Um ein Modell zu installieren, verwenden Sie den Link „Magic Setup“, um es in Vibe zu öffnen, oder kopieren Sie den Direktdownload-Link in die Vibe-Einstellungen.

## Verfügbare Modelle

### 🌱 Tiny-Modell

Eine kompakte und effiziente Version, geeignet für schnelle Aufgaben und Umgebungen mit begrenzten Ressourcen.

[👉 Magic Setup](https://shorturl.at/XSP9R)  
[🔽 Direktdownload](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true)

### 🌿 Small-Modell

Ein kleines, aber leistungsfähiges Modell für eine Balance aus Effizienz und Leistung.

[👉 Magic Setup](https://shorturl.at/EmJS8)  
[🔽 Direktdownload](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true)

### ⚖️ Medium-Modell

Balanciert Leistung und Ressourcenverbrauch und eignet sich damit ideal für die meisten allgemeinen Anwendungen.

[👉 Magic Setup](https://shorturl.at/Ha6br)  
[🔽 Direktdownload](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true)

### 🚀 Large-Modell (v3)

Für hohe Genauigkeit und mit höherem Rechenaufwand, überzeugt bei komplexen Szenarien.

[👉 Magic Setup](https://tinyurl.com/3cn846h8)  
[🔽 Direktdownload](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin?download=true)

### 🚀 Large v3 Turbo (Empfohlen)

[👉 Magic Setup](https://tinyurl.com/yphwban5)  
[🔽 Direktdownload](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin)

### 🦜 Parakeet TDT 0.6B v3

Unterstützt Streaming und eignet sich am besten für Diktate.

[👉 Modell ansehen](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/tree/main)  
[🔽 Q4_K_M herunterladen](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/resolve/main/parakeet-tdt-0.6b-v3-Q4_K_M.gguf?download=true)

### ⚡ Nemotron 3.5 ASR Streaming 0.6B

Unterstützt Streaming und eignet sich am besten für Diktate.

[👉 Modell ansehen](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf)  
[🔽 Q4_K_M herunterladen](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf/resolve/main/nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf?download=true)

### Für andere Sprachen optimierte Modelle

<details>
<summary>✡️ Hebräisch (Ivrit)</summary>

Spezialisiert auf hebräische (Ivrit) Sprachdaten, optimiert für hohe Geschwindigkeit und Genauigkeit bei hebräischen Aufgaben.

[👉 Magic Setup (Large v3 Turbo)](https://tinyurl.com/t9r3tyxk)  
[🔽 Direktdownload (Large v3 Turbo)](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true)

</details>

<details>
<summary>🇳🇴 Norwegisch</summary>
	
Optimiert für Norwegisch vom [AI Lab der norwegischen Nationalbibliothek](https://huggingface.co/NbAiLab).

[👉 Magic Setup (medium)](https://tinyurl.com/5wzb9ux8)  
[🔽 Direktdownload (medium)](https://huggingface.co/NbAiLab/nb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Magic Setup (large)](https://tinyurl.com/f228efbu)  
[🔽 Direktdownload (large)](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model.bin?download=true)

Weitere Modelle in kleineren Größen sind über [deren Hugging-Face-Downloadseite](https://huggingface.co/NbAiLab/nb-whisper-large) verfügbar.  
Suchen Sie die gewünschte Größe, laden Sie die Datei _ggml-model.bin_ herunter, benennen Sie sie um und legen Sie sie im Modellordner von Vibe ab.

</details>

<details>
<summary>🇸🇪 Schwedisch</summary>

Optimiert für Schwedisch vom [Data Lab der schwedischen Nationalbibliothek](https://huggingface.co/KBLab).

[👉 Magic Setup (medium)](https://tinyurl.com/ynawnc33)  
[🔽 Direktdownload (medium)](https://huggingface.co/KBLab/kb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Magic Setup (large v3)](https://tinyurl.com/46dvpeky)  
[🔽 Direktdownload (large v3)](https://huggingface.co/KBLab/kb-whisper-large/blob/main/ggml-model.bin?download=true)

Weitere Modelle in kleineren Größen sind über [deren Hugging-Face-Downloadseite](https://huggingface.co/KBLab/kb-whisper-large) verfügbar.  
Suchen Sie die gewünschte Größe, laden Sie die Datei _ggml-model.bin_ herunter, benennen Sie sie um und legen Sie sie im Modellordner von Vibe ab.

</details>
</details>

Viel Freude beim Entdecken dieser Modelle und beim Aufwerten Ihres Vibe! 🌐✨

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
