# Instalação (RW Vibe)

## Requisitos do sistema

- Windows: versão `8` ou superior
- macOS: versão `13.3` ou superior
- Linux: testado em `Ubuntu 22.04+`

Hardware:
não há requisito especial. O consumo de recursos pode ser ajustado nas configurações avançadas do app.

Observações:

- No Linux, “escutar” o áudio do sistema pode não estar disponível dependendo do ambiente.
- Em alguns cenários no Linux, pode ser necessário definir:

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## Sumarização com Ollama (opcional)

1. Instale o Ollama: https://ollama.com
2. Baixe um modelo (exemplo):

```console
ollama run llama3.1
```

3. No app, habilite a opção de sumarização antes da etapa de transcrição e execute um “check” para validar.

## Stable Timestamps (legendas / vídeos longos)

O RW Vibe inclui um modo de timestamps mais estáveis para legendas em conteúdos longos.

1. Abra `Mais opções`
2. Ative `Stable timestamps`
3. Se solicitado, baixe o modelo VAD

Notas:

- Esse modo prioriza qualidade e costuma ser mais lento (em torno de `4x`)
- Modelo VAD padrão: `ggml-silero-v6.2.0.bin`
- Fonte: https://huggingface.co/ggml-org/whisper-vad

## Instalação offline

Se você precisa usar o app sem internet:

1. Abra o aplicativo, cancele o download automático quando solicitado
2. Vá em `Personalizar` e selecione manualmente o modelo na pasta de modelos

## macOS: transcrições mais rápidas (2–3x)

1. Baixe o `.mlmodelc.zip` compatível com o seu modelo em https://huggingface.co/ggerganov/whisper.cpp/tree/main
2. Abra a pasta de modelos pelo menu do RW Vibe
3. Coloque o `.mlmodelc` ao lado do `.bin`
4. Na primeira execução o app compila o modelo; depois as transcrições tendem a ficar mais rápidas

## Windows: erro `msvc140.dll` ausente

Instale o Visual C++ Redistributable:
https://aka.ms/vs/17/release/vc_redist.x64.exe

## Links especiais para download de modelos (deep-link)

O app entende links do tipo:

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

Também é aceito:

```
rwvibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## Uso em servidor Linux

Para executar em Linux sem ambiente gráfico, pode ser necessário instalar um display virtual:

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1
```
