<p align="center">
  <img width="96px" alt="RW Vibe logo" src="./design/logo.png" />
</p>

<h1 align="center">RW Vibe</h1>

<p align="center">
  <strong>Transcrição offline de áudio/vídeo usando Whisper, com foco em privacidade e produtividade</strong>
  <br />
  <em>Padronizado para uso interno e entregas da RW Consultoria</em>
</p>

## Visão geral

O RW Vibe é um aplicativo desktop (Tauri + React) para transcrever áudio e vídeo localmente, sem enviar arquivos para terceiros. Ele suporta múltiplos formatos de exportação e inclui recursos opcionais como sumarização (Claude API) e análise local via Ollama.

## Como usar (usuário final)

- Abrir o aplicativo, selecionar um arquivo de áudio/vídeo e iniciar a transcrição.
- Exportar o resultado em `SRT`, `VTT`, `TXT`, `HTML`, `PDF`, `JSON`, `DOCX`.
- Recursos avançados: transcrição em lote, microfone, áudio do sistema, diarização de falantes e modo “stable timestamps”.

## Configuração (o que precisa ser definido)

**Variáveis de ambiente (build-time do frontend)** — usadas para padronizar links e suporte:

- `VITE_COMPANY_NAME` (padrão: `RW Consultoria`)
- `VITE_APP_NAME` (padrão: `Vibe`)
- `VITE_APP_DISPLAY_NAME` (padrão: `${VITE_APP_NAME} | ${VITE_COMPANY_NAME}`)
- `VITE_SUPPORT_EMAIL` (padrão: `suporte@rwconsultoria.com.br`)
- `VITE_SUPPORT_URL` (padrão: `mailto:${VITE_SUPPORT_EMAIL}`)
- `VITE_ABOUT_URL` (padrão: `https://rwconsultoria.com.br/`)
- `VITE_UPDATE_URL`, `VITE_LATEST_RELEASE_URL`, `VITE_FALLBACK_DOWNLOAD_URL` (opcionais)
- `VITE_MODELS_DOC_URL`, `VITE_INSTALL_DOC_URL`, `VITE_COMMUNITY_URL` (opcionais)

**Variáveis de ambiente (build-time do Tauri / Rust)**:

- Analytics (opcional): `APTABASE_APP_KEY` e `APTABASE_BASE_URL`
- Atualizações automáticas (opcional): configurar `desktop/src-tauri/tauri.conf.json` (endpoints e pubkey)

## Como executar (desenvolvimento)

Pré-requisitos: `pnpm`, `uv` e `cargo` (Rust). Dependências de SO seguem os pré-requisitos do Tauri.

1. Baixar sidecars/dependências da aplicação:

```console
uv run scripts/pre_build.py
```

2. Instalar dependências do frontend:

```console
cd desktop
pnpm install
```

3. Rodar em modo desenvolvimento:

```console
pnpm exec tauri dev
```

## Como gerar build (produção)

```console
uv run scripts/pre_build.py --build
cd desktop
pnpm exec tauri build
```

## Estrutura do projeto

- `desktop/`: frontend (React/Vite) e configuração do app
- `desktop/src-tauri/`: backend Rust (Tauri), sidecars e configurações de bundle
- `scripts/`: automações (pre-build, assinatura, release)
- `docs/`: notas técnicas (build, instalação, arquitetura e debug)

## Créditos e licenças

- Tauri: https://tauri.app/
- whisper.cpp: https://github.com/ggerganov/whisper.cpp
- Modelos Whisper (OpenAI): https://openai.com/research/whisper
