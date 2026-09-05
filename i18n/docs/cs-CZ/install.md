<!-- source: 664188849caa -->

# Poznámky k instalaci 📝

## Systémové požadavky

Windows: verze `8` nebo novější.

macOS: verze `13.3` nebo novější.

Linux: testováno na `ubuntu-22.04+`

Hardware:
Žádné zvláštní požadavky. Využití zdrojů lze upravit v pokročilém nastavení v hlavním okně.

V současnosti není na `Linux` podporováno sledování zvukového souboru

Kromě toho možná budete muset před spuštěním nastavit tuto proměnnou prostředí

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## Nastavení shrnutí pomocí Ollama

1. Nainstalujte Ollama

Stáhněte a nainstalujte Ollama z https://ollama.com.

2. Nainstalujte model

Po instalaci nastavte model pro shrnutí. Můžete například nainstalovat `llama3.1` spuštěním následujícího příkazu v terminálu:

```console
ollama run llama3.1
```

3. Povolte shrnutí

Po instalaci modelu otevřete aplikaci Ollama. Přejděte do Další možnosti a povolte Shrnout těsně před krokem přepisu. Nastavení můžete ponechat na výchozích hodnotách.

_Ujistěte se, že jste spustili 'Spustit kontrolu` a ověřili, že to funguje_

To je vše! Shrnutí bude nyní v Ollama aktivní.

## Stabilní časové značky (titulky / filmy)

Vibe obsahuje režim stabilních časových značek pro přesnější časování titulků u dlouhého obsahu.

1. Otevřete `Další možnosti`.
2. Povolte `Stabilní časové značky`.
3. Pokud budete vyzváni, stáhněte model VAD.

Poznámky:

- Tento režim upřednostňuje kvalitu a je obvykle přibližně `4x` pomalejší než běžný přepis.
- Nejlépe se hodí pro tvorbu titulků a časování přepisu filmů/videí.
- Výchozí použitý model VAD: `ggml-silero-v6.2.0.bin`
- Zdroj modelu: `https://huggingface.co/ggml-org/whisper-vad`

## Překlad do angličtiny

Překlad do angličtiny funguje pouze s modely Whisper `small`, `medium` a `large`. Nefunguje s modelem Whisper `large-v3-turbo`.

Pokud potřebujete překlad, stáhněte podporovaný model z [dokumentace k modelům](/vibe/docs#models).

## Ruční instalace 🛠️

`MacOS Apple silicon`: nainstalujte soubor `aarch64.dmg` z [vydání](https://github.com/thewh1teagle/vibe/releases) **Nezapomeňte poprvé kliknout pravým tlačítkem a otevřít ze složky Aplikace**

`MacOS Intel`: nainstalujte soubor `x64.dmg` z [vydání](https://github.com/thewh1teagle/vibe/releases) **Nezapomeňte poprvé kliknout pravým tlačítkem a otevřít ze složky Aplikace**

`Windows`: nainstalujte soubor `.exe` z [vydání](https://github.com/thewh1teagle/vibe/releases)

`Linux`: nainstalujte `.deb` z [vydání](https://github.com/thewh1teagle/vibe/releases) (uživatelé `Arch` mohou použít [debtap](https://aur.archlinux.org/packages/debtap))

_Všechny modely jsou dostupné pro ruční instalaci. viz [Předpřipravené modely](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Offline nastavení 💾

Offline instalace s Vibe je snadná: otevřete aplikaci, zrušte stahování a přejděte do sekce `Přizpůsobit` v nastavení.

_Všechny modely jsou dostupné pro ruční instalaci. viz nastavení nebo [Předpřipravené modely](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Rychlejší přepisy na macOS (2-3x) 🌟

1. Stáhněte odpovídající soubor `.mlcmodelc.zip` pro váš model z https://huggingface.co/ggerganov/whisper.cpp/tree/main

- např. `ggml-medium-encoder.mlmodelc.zip` odpovídá `ggml-medium-encoder.bin`

2. Otevřete cestu k modelům v nastavení Vibe
3. Přetáhněte soubor `.mlcmodel.c` do složky s modely tak, aby byl vedle souboru `.bin`
4. Přepište soubor; při prvním použití modelu to bude trvat déle, protože se model kompiluje. Při každém dalším použití to bude rychlejší.

## Chyba: `msvc140.dll` nebyl nalezen ❌

Stáhněte a nainstalujte [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## Speciální odkaz pro stahování modelů ve Vibe

Na svůj web můžete přidat odkazy, které uživatelům umožní snadno stáhnout vaše modely přímo z webu do Vibe.

Adresa URL by měla vypadat takto

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## Použití na linuxovém serveru

Pro použití Vibe na linuxovém serveru je třeba nainstalovat falešný displej

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
