<!-- source: 664188849caa -->

# Notas de instalação 📝

## Requisitos do sistema

Windows: Versão `8` ou superior.

macOS: Versão `13.3` ou superior.

Linux: Testado no `ubuntu-22.04+`

Hardware:
Nenhum requisito especial. O uso de recursos pode ser personalizado através das configurações avançadas na janela principal.

Atualmente, a escuta do arquivo de áudio não é suportada no `Linux`

Além disso, pode ser necessário definir esta variável de ambiente antes de iniciá-lo

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## Configurando o resumo com o Ollama

1. Instale o Ollama

Baixe e instale o Ollama em https://ollama.com.

2. Instale um modelo

Depois de instalado, configure um modelo para o resumo. Por exemplo, você pode instalar o `llama3.1` executando o seguinte comando no terminal:

```console
ollama run llama3.1
```

3. Ative o resumo

Depois que o modelo estiver instalado, abra o app do Ollama. Navegue até `Mais opções` e ative `Resumir` logo antes da etapa de transcrição. Você pode deixar as configurações com os valores padrão.

_Certifique-se de executar a 'Executar verificação` para ver se funciona_

Pronto! O resumo agora estará ativo no Ollama.

## Marcações de tempo estáveis (Legendas / Filmes)

O Vibe inclui um modo de marcações de tempo estáveis para uma sincronização de legendas mais precisa em conteúdos longos.

1. Abra `Mais opções`.
2. Ative `Marcações de tempo estáveis`.
3. Se solicitado, baixe o modelo VAD.

Notas:

- Este modo prioriza a qualidade e costuma ser cerca de `4x` mais lento que a transcrição normal.
- Ideal para a criação de legendas e sincronização de transcrições de filmes/vídeos.
- Modelo VAD usado por padrão: `ggml-silero-v6.2.0.bin`
- Fonte original do modelo: `https://huggingface.co/ggml-org/whisper-vad`

## Traduzindo para o inglês

A tradução para o inglês funciona apenas com os modelos `small`, `medium` e `large` do Whisper. Não funciona com o `large-v3-turbo`.

Se você precisar de tradução, baixe um modelo compatível na [documentação de modelos](/vibe/docs#models).

## Instalação manual 🛠️

`MacOS Apple silicon`: instale o arquivo `aarch64.dmg` a partir das [releases](https://github.com/thewh1teagle/vibe/releases) **Não esqueça de clicar com o botão direito e abrir a partir de Aplicativos uma vez**

`MacOS Intel`: instale o arquivo `x64.dmg` a partir das [releases](https://github.com/thewh1teagle/vibe/releases) **Não esqueça de clicar com o botão direito e abrir a partir de Aplicativos uma vez**

`Windows`: instale o arquivo `.exe` a partir das [releases](https://github.com/thewh1teagle/vibe/releases)

`Linux`: instale o `.deb` a partir das [releases](https://github.com/thewh1teagle/vibe/releases) (usuários do `Arch` podem usar o [debtap](https://aur.archlinux.org/packages/debtap))

_Todos os modelos disponíveis para instalação manual. Veja os [modelos pré-compilados](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Configuração offline 💾

A instalação offline com o Vibe é fácil: abra o aplicativo, cancele o download e navegue até a seção `Personalizar` nas configurações.

_Todos os modelos disponíveis para instalação manual. Veja as configurações ou os [modelos pré-compilados](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Transcrições mais rápidas no macOS (2-3x) 🌟

1. Baixe o arquivo `.mlcmodelc.zip` correspondente ao seu modelo em https://huggingface.co/ggerganov/whisper.cpp/tree/main

- ex.: `ggml-medium-encoder.mlmodelc.zip` corresponde a `ggml-medium-encoder.bin`

2. Abra o caminho dos modelos nas configurações do Vibe
3. Arraste e solte o arquivo `.mlcmodel.c` na pasta de modelos, de modo que fique junto do arquivo `.bin`
4. Transcreva um arquivo; na primeira vez que você usar o modelo, vai demorar mais, pois ele está sendo compilado. Nas vezes seguintes será mais rápido.

## Erro de `msvc140.dll` não encontrado ❌

Baixe e instale o [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## Link especial para baixar modelos no vibe

Você pode adicionar links no seu site para permitir que os usuários baixem seus modelos facilmente do seu site diretamente para o vibe.

A URL deve ser assim

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## Uso em servidor linux

Para usar o Vibe em um servidor linux, você precisa instalar um display falso

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
