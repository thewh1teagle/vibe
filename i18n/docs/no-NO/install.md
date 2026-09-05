<!-- source: 664188849caa -->

# Installasjonsnotater 📝

## Systemkrav

Windows: Versjon `8` eller nyere.

macOS: Versjon `13.3` eller nyere.

Linux: Testet på `ubuntu-22.04+`

Maskinvare:
Ingen spesielle krav. Ressursbruken kan tilpasses gjennom avanserte innstillinger i hovedvinduet.

Foreløpig støttes ikke lytting til lydfilen på `Linux`

I tillegg kan det hende du må sette denne miljøvariabelen før du starter den

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## Sette opp sammendrag med Ollama

1. Installer Ollama

Last ned og installer Ollama fra https://ollama.com.

2. Installer en modell

Når Ollama er installert, sett opp en modell for sammendrag. Du kan for eksempel installere `llama3.1` ved å kjøre følgende kommando i terminalen:

```console
ollama run llama3.1
```

3. Aktiver sammendrag

Når modellen er installert, åpne Ollama-appen. Naviger til Flere alternativer og aktiver Sammendrag rett før transkripsjonssteget. Du kan la innstillingene stå på standardverdiene.

_Husk å kjøre «Run check» for å se at det fungerer_

Det er alt! Sammendrag er nå aktivt i Ollama.

## Stabile tidsstempler (Undertekster / Filmer)

Vibe har en modus for stabile tidsstempler for strammere undertekst-timing på lengre innhold.

1. Åpne `Flere alternativer`.
2. Aktiver `Stabile tidsstempler`.
3. Hvis du blir spurt, last ned VAD-modellen.

Merknader:

- Denne modusen prioriterer kvalitet og er som regel omtrent `4x` tregere enn vanlig transkripsjon.
- Best egnet for opprettelse av undertekster og timing av film-/videotranskripsjoner.
- VAD-modell brukt som standard: `ggml-silero-v6.2.0.bin`
- Kilde til modellen: `https://huggingface.co/ggml-org/whisper-vad`

## Oversette til engelsk

Oversettelse til engelsk fungerer bare med Whisper-modellene `small`, `medium` og `large`. Det fungerer ikke med Whisper `large-v3-turbo`.

Hvis du trenger oversettelse, last ned en støttet modell fra [modelldokumentasjonen](/vibe/docs#models).

## Manuell installasjon 🛠️

`MacOS Apple silicon`: installer `aarch64.dmg`-filen fra [utgivelser](https://github.com/thewh1teagle/vibe/releases) **Ikke glem å høyreklikke og åpne fra Programmer én gang**

`MacOS Intel`: installer `x64.dmg`-filen fra [utgivelser](https://github.com/thewh1teagle/vibe/releases) **Ikke glem å høyreklikke og åpne fra Programmer én gang**

`Windows`: installer `.exe`-filen fra [utgivelser](https://github.com/thewh1teagle/vibe/releases)

`Linux`: installer `.deb` fra [utgivelser](https://github.com/thewh1teagle/vibe/releases) (`Arch`-brukere kan bruke [debtap](https://aur.archlinux.org/packages/debtap))

_Alle modeller er tilgjengelige for manuell installasjon. Se [ferdigbygde modeller](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Offline-oppsett 💾

Offline-installasjon med Vibe er enkelt: åpne appen, avbryt nedlastingen, og naviger til `Tilpass`-delen i innstillingene.

_Alle modeller er tilgjengelige for manuell installasjon. Se innstillinger eller [ferdigbygde modeller](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Raskere transkripsjon på macOS (2-3x) 🌟

1. Last ned tilsvarende `.mlcmodelc.zip` for modellen din fra https://huggingface.co/ggerganov/whisper.cpp/tree/main

- f.eks. `ggml-medium-encoder.mlmodelc.zip` tilsvarer `ggml-medium-encoder.bin`

2. Åpne modellmappen fra Vibe-innstillingene
3. Dra og slipp `.mlcmodel.c`-filen inn i modellmappen slik at den ligger ved siden av `.bin`-filen
4. Transkriber en fil. Første gang du bruker modellen tar det lengre tid fordi den kompilerer modellen. Hver gang etter det vil det gå raskere.

## Feilmelding om at `msvc140.dll` ikke ble funnet ❌

Last ned og installer [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## Spesiell lenke for å laste ned modeller i vibe

Du kan legge lenker på nettsidene dine slik at brukere enkelt kan laste ned modellene dine direkte fra nettsiden din til vibe.

URL-en bør se slik ut

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## Bruk på Linux-server

For å bruke Vibe på en Linux-server må du installere en falsk skjerm

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
