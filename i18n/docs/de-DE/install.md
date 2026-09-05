<!-- source: 664188849caa -->

# Installationshinweise 📝

## Systemanforderungen

Windows: Version `8` oder höher.

macOS: Version `13.3` oder höher.

Linux: Getestet unter `ubuntu-22.04+`

Hardware:
Keine besonderen Anforderungen. Die Ressourcennutzung kann über die erweiterten Einstellungen im Hauptfenster angepasst werden.

Aktuell wird das Abhören der Audiodatei unter `Linux` nicht unterstützt.

Außerdem müssen Sie eventuell vor dem Start diese Umgebungsvariable setzen

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## Zusammenfassung mit Ollama einrichten

1. Ollama installieren

Laden Sie Ollama von https://ollama.com herunter und installieren Sie es.

2. Ein Modell installieren

Richten Sie nach der Installation ein Modell für die Zusammenfassung ein. Sie können zum Beispiel `llama3.1` installieren, indem Sie den folgenden Befehl in Ihrem Terminal ausführen:

```console
ollama run llama3.1
```

3. Zusammenfassung aktivieren

Öffnen Sie nach der Installation des Modells die Ollama-App. Gehen Sie zu Weitere Optionen und aktivieren Sie Zusammenfassen kurz vor dem Transkriptionsschritt. Sie können die Einstellungen auf ihren Standardwerten belassen.

_Stellen Sie sicher, dass Sie die „Prüfung ausführen“ starten, um zu sehen, dass es funktioniert_

Das war's! Die Zusammenfassung ist jetzt in Ollama aktiv.

## Stabile Zeitstempel (Untertitel / Filme)

Vibe enthält einen Modus für stabile Zeitstempel für präzisere Untertitel-Zeitangaben bei langen Inhalten.

1. Öffnen Sie `Weitere Optionen`.
2. Aktivieren Sie `Stabile Zeitstempel`.
3. Laden Sie bei Aufforderung das VAD-Modell herunter.

Hinweise:

- Dieser Modus priorisiert Qualität und ist in der Regel etwa `4x` langsamer als die normale Transkription.
- Am besten geeignet für die Erstellung von Untertiteln und die Zeitabstimmung von Film-/Video-Transkripten.
- Standardmäßig verwendetes VAD-Modell: `ggml-silero-v6.2.0.bin`
- Ursprungsquelle des Modells: `https://huggingface.co/ggml-org/whisper-vad`

## Übersetzen ins Englische

Die Übersetzung ins Englische funktioniert nur mit den Whisper-Modellen `small`, `medium` und `large`. Sie funktioniert nicht mit `large-v3-turbo`.

Wenn Sie eine Übersetzung benötigen, laden Sie ein unterstütztes Modell aus den [Modell-Dokumenten](/vibe/docs#models) herunter.

## Manuelle Installation 🛠️

`MacOS Apple silicon`: Installieren Sie die Datei `aarch64.dmg` aus den [Releases](https://github.com/thewh1teagle/vibe/releases) **Vergessen Sie nicht, sie einmal mit Rechtsklick aus dem Programme-Ordner zu öffnen**

`MacOS Intel`: Installieren Sie die Datei `x64.dmg` aus den [Releases](https://github.com/thewh1teagle/vibe/releases) **Vergessen Sie nicht, sie einmal mit Rechtsklick aus dem Programme-Ordner zu öffnen**

`Windows`: Installieren Sie die Datei `.exe` aus den [Releases](https://github.com/thewh1teagle/vibe/releases)

`Linux`: Installieren Sie die `.deb`-Datei aus den [Releases](https://github.com/thewh1teagle/vibe/releases) (`Arch`-Nutzer können [debtap](https://aur.archlinux.org/packages/debtap) verwenden)

_Alle Modelle stehen zur manuellen Installation zur Verfügung. siehe [Vorgefertigte Modelle](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Offline-Einrichtung 💾

Die Offline-Installation mit Vibe ist einfach: Öffnen Sie die App, brechen Sie den Download ab und gehen Sie im Bereich Einstellungen zum Abschnitt `Anpassen`.

_Alle Modelle stehen zur manuellen Installation zur Verfügung. siehe Einstellungen oder [Vorgefertigte Modelle](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Schnellere Transkriptionen unter macOS (2-3x) 🌟

1. Laden Sie die passende `.mlcmodelc.zip`-Datei für Ihr Modell von https://huggingface.co/ggerganov/whisper.cpp/tree/main herunter

- z. B. passt `ggml-medium-encoder.mlmodelc.zip` zu `ggml-medium-encoder.bin`

2. Öffnen Sie den Modellpfad aus den Vibe-Einstellungen
3. Ziehen Sie die Datei `.mlcmodel.c` per Drag-and-Drop in den Modellordner, sodass sie neben der `.bin`-Datei liegt
4. Transkribieren Sie eine Datei. Beim ersten Verwenden des Modells dauert es länger, da das Modell kompiliert wird. Danach wird es jedes Mal schneller.

## Fehler „`msvc140.dll` nicht gefunden“ ❌

Laden Sie [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe) herunter und installieren Sie es

## Spezieller Link zum Herunterladen von Modellen in Vibe

Sie können Links auf Ihrer Website hinzufügen, damit Nutzer Ihre Modelle direkt von Ihrer Website in Vibe herunterladen können.

Die URL sollte etwa so aussehen

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## Verwendung auf einem Linux-Server

Um Vibe auf einem Linux-Server zu verwenden, müssen Sie ein virtuelles Display installieren

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
