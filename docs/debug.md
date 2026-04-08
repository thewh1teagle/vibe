# Solução de problemas (RW Vibe)

Use este checklist para investigar travamentos e erros. Quanto mais informações, mais rápido conseguimos fechar o diagnóstico.

1. Confirme se o arquivo de áudio/vídeo é válido (teste com outro arquivo). Um exemplo está em `samples/single.wav`.
2. Se houver mensagem de erro, use o botão de “Relatar problema” (ele abre um e-mail com logs).
3. Se o app travar sem mostrar erro, execute pelo terminal com logs habilitados (passos abaixo).
4. Se estiver usando um modelo diferente do padrão, teste também com o modelo padrão para isolar o problema.

<details>
<summary>Windows</summary>

a. Abra `cmd.exe`
b. Execute:

```console
taskkill /IM vibe.exe /F
set RUST_BACKTRACE=1
set RUST_LOG=vibe=debug,whisper_rs=debug
%localappdata%\br.com.rwconsultoria.vibe\vibe.exe
```

</details>

<details>
<summary>macOS</summary>

```console
RUST_LOG=vibe=debug,whisper_rs=debug RUST_BACKTRACE=1 /Applications/RW\ Vibe.app/Contents/MacOS/vibe
```

</details>

<details>
<summary>Linux</summary>

Execute similar ao macOS, apenas ajustando o caminho do binário.

</details>

O problema também acontece com o whisper.cpp “puro”?

<details>

1. Baixe um `zip` do whisper.cpp (binário) em https://github.com/ggerganov/whisper.cpp/releases (Windows: prefira `whisper-bin-x64.zip`)
2. Extraia e abra a pasta
3. Copie `samples/single.wav` deste repositório para a mesma pasta e valide que ele toca normalmente
4. Rode um teste básico:

```console
main.exe -m "<CAMINHO_PARA_SEU_MODELO>.bin" -f "single.wav"
```

</details>

<details>
<summary>App crashing and no even errors!</summary>

No Windows, abra o `Visualizador de Eventos`, vá em `Logs do Windows` -> `Aplicativo` e verifique erros no horário do travamento.

</details>

<details>
<summary>Find debug log file</summary>
Se você não consegue abrir o app por causa do travamento, verifique os logs em:

macOS: `$HOME/Library/Application Support/br.com.rwconsultoria.vibe`

Windows: `%appdata%\br.com.rwconsultoria.vibe`

Linux: `~/.config/br.com.rwconsultoria.vibe`

</details>

<details>
<summary>Get OS information for posting in a bug</summary>

## Windows

1. Open `cmd.exe`
2. Execute the following

```console
winget install neofetch
neofetch
```

3. Copie e cole a saída junto com os logs do app

## macOS

```console
brew install neofetch
neofetch
```

## Linux

```console
sudo apt-get update
sudo apt install -y neofetch
neofetch
```

</details>

<details>
<summary>vulkan-1.dll or vcomp140.dll is missing</summary>

For `vcomp140.dll` install [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

For `vulkan-1.dll` install [VulkanRT-Installer.exe](https://sdk.lunarg.com/sdk/download/1.3.290.0/windows/VulkanRT-1.3.290.0-Installer.exe)

</details>

Ao final, envie os resultados pelo botão “Relatar problema” dentro do app (ou encaminhe os logs ao suporte da RW Consultoria).
