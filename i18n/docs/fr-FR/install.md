<!-- source: 664188849caa -->

# Notes d'installation 📝

## Configuration requise

Windows : Version `8` ou supérieure.

macOS : Version `13.3` ou supérieure.

Linux : Testé sur `ubuntu-22.04+`

Matériel :
Aucune exigence particulière. L'utilisation des ressources peut être personnalisée via les paramètres avancés dans la fenêtre principale.

Actuellement, l'écoute du fichier audio n'est pas prise en charge sur `Linux`

Vous devrez peut-être également définir cette variable d'environnement avant de le démarrer

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## Configurer le résumé avec Ollama

1. Installer Ollama

Téléchargez et installez Ollama depuis https://ollama.com.

2. Installer un modèle

Une fois installé, configurez un modèle pour le résumé. Par exemple, vous pouvez installer `llama3.1` en exécutant la commande suivante dans votre terminal :

```console
ollama run llama3.1
```

3. Activer le résumé

Une fois le modèle installé, ouvrez l'application Ollama. Accédez à `Plus d'options` et activez le résumé juste avant l'étape de transcription. Vous pouvez laisser les paramètres à leurs valeurs par défaut.

_Assurez-vous d'exécuter « Lancer la vérification » pour vérifier que cela fonctionne_

C'est tout ! Le résumé sera désormais actif dans Ollama.

## Horodatages stables (sous-titres / films)

Vibe inclut un mode d'horodatage stable pour un minutage des sous-titres plus précis sur les contenus longs.

1. Ouvrez `Plus d'options`.
2. Activez `Horodatages stables`.
3. Si vous y êtes invité, téléchargez le modèle VAD.

Remarques :

- Ce mode privilégie la qualité et est généralement environ `4x` plus lent que la transcription normale.
- Idéal pour la création de sous-titres et le minutage de transcriptions de films/vidéos.
- Modèle VAD utilisé par défaut : `ggml-silero-v6.2.0.bin`
- Source du modèle en amont : `https://huggingface.co/ggml-org/whisper-vad`

## Traduire vers l'anglais

La traduction vers l'anglais fonctionne uniquement avec les modèles Whisper `small`, `medium` et `large`. Elle ne fonctionne pas avec `large-v3-turbo` de Whisper.

Si vous avez besoin de traduction, téléchargez un modèle pris en charge depuis la [documentation des modèles](/vibe/docs#models).

## Installation manuelle 🛠️

`MacOS Apple silicon` : installez le fichier `aarch64.dmg` depuis les [releases](https://github.com/thewh1teagle/vibe/releases) **N'oubliez pas de faire un clic droit et d'ouvrir depuis Applications une fois**

`MacOS Intel` : installez le fichier `x64.dmg` depuis les [releases](https://github.com/thewh1teagle/vibe/releases) **N'oubliez pas de faire un clic droit et d'ouvrir depuis Applications une fois**

`Windows` : installez le fichier `.exe` depuis les [releases](https://github.com/thewh1teagle/vibe/releases)

`Linux` : installez le fichier `.deb` depuis les [releases](https://github.com/thewh1teagle/vibe/releases) (les utilisateurs `Arch` peuvent utiliser [debtap](https://aur.archlinux.org/packages/debtap))

_Tous les modèles sont disponibles pour une installation manuelle. Voir les [modèles préconstruits](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Installation hors ligne 💾

L'installation hors ligne avec Vibe est simple : ouvrez l'application, annulez le téléchargement, puis accédez à la section `Personnaliser` dans les paramètres.

_Tous les modèles sont disponibles pour une installation manuelle. Voir les paramètres ou les [modèles préconstruits](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Transcriptions plus rapides sur macOS (2-3x) 🌟

1. Téléchargez le fichier `.mlcmodelc.zip` correspondant à votre modèle depuis https://huggingface.co/ggerganov/whisper.cpp/tree/main

- par ex. `ggml-medium-encoder.mlmodelc.zip` correspond à `ggml-medium-encoder.bin`

2. Ouvrez le dossier des modèles depuis les paramètres de Vibe
3. Faites glisser le fichier `.mlcmodel.c` dans le dossier des modèles pour qu'il se trouve à côté du fichier `.bin`
4. Transcrivez un fichier ; la première fois que vous utilisez le modèle, cela prendra plus de temps car il compile le modèle. Chaque fois suivante sera plus rapide.

## Erreur `msvc140.dll` introuvable ❌

Téléchargez et installez [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## Lien spécial pour télécharger des modèles dans vibe

Vous pouvez ajouter des liens sur vos sites web pour permettre aux utilisateurs de télécharger facilement vos modèles depuis votre site directement vers vibe.

L'URL doit ressembler à ceci

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## Utilisation sur un serveur linux

Pour utiliser Vibe sur un serveur linux, vous devez installer un faux affichage

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
