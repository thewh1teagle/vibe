<!-- source: 664188849caa -->

# Notas de instalación 📝

## Requisitos del sistema

Windows: versión `8` o superior.

macOS: versión `13.3` o superior.

Linux: probado en `ubuntu-22.04+`

Hardware:
No hay requisitos especiales. El uso de recursos se puede personalizar en la configuración avanzada de la ventana principal.

Actualmente, la escucha del archivo de audio no es compatible en `Linux`

Además, es posible que debas configurar esta variable de entorno antes de iniciarlo

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## Configurar el resumen con Ollama

1. Instala Ollama

Descarga e instala Ollama desde https://ollama.com.

2. Instala un modelo

Una vez instalado, configura un modelo para el resumen. Por ejemplo, puedes instalar `llama3.1` ejecutando el siguiente comando en tu terminal:

```console
ollama run llama3.1
```

3. Activa el resumen

Después de instalar el modelo, abre la app de Ollama. Ve a Más Opciones y activa Resumir justo antes del paso de transcripción. Puedes dejar la configuración con sus valores predeterminados.

_Asegúrate de ejecutar la 'Verificación' para comprobar que funciona_

¡Listo! El resumen ahora estará activo en Ollama.

## Marcas de tiempo estables (subtítulos / películas)

Vibe incluye un modo de marcas de tiempo estables para ajustar mejor el tiempo de los subtítulos en contenido de larga duración.

1. Abre `Más Opciones`.
2. Activa `Marcas de tiempo estables`.
3. Si se solicita, descarga el modelo VAD.

Notas:

- Este modo prioriza la calidad y normalmente es unas `4x` más lento que la transcripción normal.
- Ideal para crear subtítulos y sincronizar transcripciones de películas o videos.
- Modelo VAD usado de forma predeterminada: `ggml-silero-v6.2.0.bin`
- Fuente original del modelo: `https://huggingface.co/ggml-org/whisper-vad`

## Traducción al inglés

La traducción al inglés solo funciona con los modelos `small`, `medium` y `large` de Whisper. No funciona con `large-v3-turbo` de Whisper.

Si necesitas traducción, descarga un modelo compatible desde la [documentación de modelos](/vibe/docs#models).

## Instalación manual 🛠️

`MacOS Apple silicon`: instala el archivo `aarch64.dmg` desde [releases](https://github.com/thewh1teagle/vibe/releases) **No olvides hacer clic derecho y abrirlo desde Aplicaciones una vez**

`MacOS Intel`: instala el archivo `x64.dmg` desde [releases](https://github.com/thewh1teagle/vibe/releases) **No olvides hacer clic derecho y abrirlo desde Aplicaciones una vez**

`Windows`: instala el archivo `.exe` desde [releases](https://github.com/thewh1teagle/vibe/releases)

`Linux`: instala el `.deb` desde [releases](https://github.com/thewh1teagle/vibe/releases) (los usuarios de `Arch` pueden usar [debtap](https://aur.archlinux.org/packages/debtap))

_Todos los modelos están disponibles para instalación manual. Consulta [Modelos preconstruidos](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Configuración sin conexión 💾

La instalación sin conexión con Vibe es fácil: abre la app, cancela la descarga y ve a la sección `Personalizar` dentro de la configuración.

_Todos los modelos están disponibles para instalación manual. Consulta la configuración o [Modelos preconstruidos](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## Transcripciones más rápidas en macOS (2-3x) 🌟

1. Descarga el archivo `.mlcmodelc.zip` correspondiente a tu modelo desde https://huggingface.co/ggerganov/whisper.cpp/tree/main

- por ejemplo, `ggml-medium-encoder.mlmodelc.zip` corresponde a `ggml-medium-encoder.bin`

2. Abre la ruta de modelos desde la configuración de Vibe
3. Arrastra y suelta el archivo `.mlcmodel.c` en la carpeta de modelos, junto al archivo `.bin`
4. Transcribe un archivo; la primera vez que uses el modelo tardará más porque se está compilando. Las siguientes veces será más rápido.

## Error de `msvc140.dll` no encontrado ❌

Descarga e instala [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## Enlace especial para descargar modelos en Vibe

Puedes agregar enlaces en tu sitio web para que los usuarios descarguen tus modelos fácilmente desde tu sitio directamente a Vibe.

La URL debe verse así

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## Uso en un servidor Linux

Para usar Vibe en un servidor Linux necesitas instalar una pantalla virtual

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
