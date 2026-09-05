<!-- source: 1d964213251f -->

# 🌟 Modèles Vibe 🌟

Bienvenue sur la page des modèles Vibe ! Vous trouverez ici une liste organisée de modèles suggérés à utiliser avec Vibe. Pour installer un modèle, utilisez le lien « Configuration magique » pour l'ouvrir dans Vibe, ou copiez-collez le lien de téléchargement direct dans les paramètres de Vibe.

## Modèles disponibles

### 🌱 Modèle Tiny

Une version compacte et efficace, adaptée aux tâches rapides et aux environnements à ressources limitées.

[👉 Configuration magique](https://shorturl.at/XSP9R)  
[🔽 Téléchargement direct](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true)

### 🌿 Modèle Small

Un modèle petit mais performant, offrant un bon équilibre entre efficacité et performance.

[👉 Configuration magique](https://shorturl.at/EmJS8)  
[🔽 Téléchargement direct](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true)

### ⚖️ Modèle Medium

Équilibre performance et utilisation des ressources, idéal pour la plupart des usages courants.

[👉 Configuration magique](https://shorturl.at/Ha6br)  
[🔽 Téléchargement direct](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true)

### 🚀 Modèle Large (v3)

Pour une précision élevée et davantage de ressources de calcul, excelle dans les scénarios complexes.

[👉 Configuration magique](https://tinyurl.com/3cn846h8)  
[🔽 Téléchargement direct](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin?download=true)

### 🚀 Large v3 Turbo (Recommandé)

[👉 Configuration magique](https://tinyurl.com/yphwban5)  
[🔽 Téléchargement direct](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin)

### 🦜 Parakeet TDT 0.6B v3

Prend en charge le streaming et est particulièrement adapté à la dictée.

[👉 Voir le modèle](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/tree/main)  
[🔽 Télécharger Q4_K_M](https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-gguf/resolve/main/parakeet-tdt-0.6b-v3-Q4_K_M.gguf?download=true)

### ⚡ Nemotron 3.5 ASR Streaming 0.6B

Prend en charge le streaming et est particulièrement adapté à la dictée.

[👉 Voir le modèle](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf)  
[🔽 Télécharger Q4_K_M](https://huggingface.co/vibe-app/nemotron-3.5-asr-streaming-0.6b-gguf/resolve/main/nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf?download=true)

### Modèles optimisés pour d'autres langues

<details>
<summary>✡️ Hébreu (Ivrit)</summary>

Spécialisé pour les données en langue hébraïque (Ivrit), optimisé pour une grande rapidité et précision dans les tâches en hébreu.

[👉 Configuration magique (Large v3 Turbo)](https://tinyurl.com/t9r3tyxk)  
[🔽 Téléchargement direct (Large v3 Turbo)](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true)

</details>

<details>
<summary>🇳🇴 Norvégien</summary>
	
Optimisé pour le norvégien par l'[AI Lab de la Bibliothèque nationale de Norvège](https://huggingface.co/NbAiLab).

[👉 Configuration magique (medium)](https://tinyurl.com/5wzb9ux8)  
[🔽 Téléchargement direct (medium)](https://huggingface.co/NbAiLab/nb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Configuration magique (large)](https://tinyurl.com/f228efbu)  
[🔽 Téléchargement direct (large)](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model.bin?download=true)

D'autres modèles de tailles plus petites sont disponibles via [leur page de téléchargement huggingface](https://huggingface.co/NbAiLab/nb-whisper-large).  
Trouvez la taille souhaitée, téléchargez le fichier _ggml-model.bin_, renommez-le, puis placez-le dans le dossier des modèles de vibe.

</details>

<details>
<summary>🇸🇪 Suédois</summary>

Optimisé pour le suédois par le [Data Lab de la Bibliothèque nationale de Suède](https://huggingface.co/KBLab).

[👉 Configuration magique (medium)](https://tinyurl.com/ynawnc33)  
[🔽 Téléchargement direct (medium)](https://huggingface.co/KBLab/kb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Configuration magique (large v3)](https://tinyurl.com/46dvpeky)  
[🔽 Téléchargement direct (large v3)](https://huggingface.co/KBLab/kb-whisper-large/blob/main/ggml-model.bin?download=true)

D'autres modèles de tailles plus petites sont disponibles via [leur page de téléchargement huggingface](https://huggingface.co/KBLab/kb-whisper-large).  
Trouvez la taille souhaitée, téléchargez le fichier _ggml-model.bin_, renommez-le, puis placez-le dans le dossier des modèles de vibe.

</details>
</details>

Amusez-vous à explorer ces modèles et à enrichir votre expérience Vibe ! 🌐✨

### Envie de plus ?

Trouvez des modèles supplémentaires ici :

[👉 Voir plus de modèles](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Préparez vos propres modèles

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
