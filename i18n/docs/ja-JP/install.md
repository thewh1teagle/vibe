<!-- source: 664188849caa -->

# インストールに関する注意 📝

## システム要件

Windows: `8` 以降

macOS: `13.3` 以降

Linux: `ubuntu-22.04+` でテスト済み

ハードウェア:
特別な要件はありません。リソース使用量はメインウィンドウの詳細設定でカスタマイズできます。

現在、`Linux` では音声ファイルの再生はサポートされていません

さらに、起動前にこの環境変数を設定する必要がある場合があります

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## Ollamaで要約を設定する

1. Ollamaをインストール

https://ollama.com からOllamaをダウンロードしてインストールしてください。

2. モデルをインストール

インストール後、要約用のモデルをセットアップします。例えば、ターミナルで次のコマンドを実行すると `llama3.1` をインストールできます。

```console
ollama run llama3.1
```

3. 要約を有効化

モデルのインストール後、Ollamaアプリを開きます。詳細オプションに移動し、文字起こしの直前で要約を有効にします。設定はデフォルト値のままで構いません。

_動作を確認するために「実行チェック」を必ず行ってください_

これで完了です！Ollamaでの要約が有効になります。

## 安定タイムスタンプ（字幕・動画向け）

Vibeには、長時間コンテンツで字幕のタイミングをより正確にするための安定タイムスタンプモードが搭載されています。

1. `詳細オプション` を開きます。
2. `安定タイムスタンプ` を有効にします。
3. 表示された場合は、VADモデルをダウンロードします。

補足:

- このモードは品質優先で、通常の文字起こしよりおよそ `4x` 遅くなります。
- 字幕作成や映画・動画の文字起こしタイミングに最適です。
- デフォルトで使用されるVADモデル: `ggml-silero-v6.2.0.bin`
- 元モデルの提供元: `https://huggingface.co/ggml-org/whisper-vad`

## 英語への翻訳

英語への翻訳はWhisperの `small`、`medium`、`large` モデルでのみ動作します。Whisperの `large-v3-turbo` では動作しません。

翻訳が必要な場合は、[モデルのドキュメント](/vibe/docs#models) から対応モデルをダウンロードしてください。

## 手動インストール 🛠️

`MacOS Apple silicon`: [releases](https://github.com/thewh1teagle/vibe/releases) から `aarch64.dmg` ファイルをインストールしてください **右クリックして一度Applicationsから開くのを忘れずに**

`MacOS Intel`: [releases](https://github.com/thewh1teagle/vibe/releases) から `x64.dmg` ファイルをインストールしてください **右クリックして一度Applicationsから開くのを忘れずに**

`Windows`: [releases](https://github.com/thewh1teagle/vibe/releases) から `.exe` ファイルをインストールしてください

`Linux`: [releases](https://github.com/thewh1teagle/vibe/releases) から `.deb` をインストールしてください（`Arch` ユーザーは [debtap](https://aur.archlinux.org/packages/debtap) を使用できます）

_すべてのモデルは手動インストールに対応しています。[ビルド済みモデル](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1) を参照してください_

## オフラインセットアップ 💾

Vibeのオフラインインストールは簡単です。アプリを開き、ダウンロードをキャンセルして、設定内の `カスタマイズ` セクションに移動してください。

_すべてのモデルは手動インストールに対応しています。設定または [ビルド済みモデル](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1) を参照してください_

## macOSでの文字起こしを高速化（2〜3倍）🌟

1. 使用するモデルに対応する `.mlcmodelc.zip` を https://huggingface.co/ggerganov/whisper.cpp/tree/main からダウンロードします

- 例: `ggml-medium-encoder.mlmodelc.zip` は `ggml-medium-encoder.bin` に対応します

2. Vibeの設定からモデルのパスを開きます
3. `.mlcmodel.c` ファイルを、`.bin` ファイルと同じ場所になるようにモデルフォルダにドラッグ＆ドロップします
4. ファイルを文字起こしします。モデルを初めて使用する際はモデルのコンパイルに時間がかかりますが、以降は高速になります。

## `msvc140.dll` が見つからないエラー ❌

[vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe) をダウンロードしてインストールしてください

## Vibeでモデルをダウンロードするための特別なリンク

ウェブサイトにリンクを追加することで、ユーザーがあなたのウェブサイトから直接Vibeへモデルを簡単にダウンロードできるようにできます。

URLは次のような形式にします

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## Linuxサーバーでの使用

LinuxサーバーでVibeを使用するには、仮想ディスプレイをインストールする必要があります

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
