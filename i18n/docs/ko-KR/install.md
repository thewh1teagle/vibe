<!-- source: 664188849caa -->

# 설치 안내 📝

## 시스템 요구 사항

Windows: `8` 이상 버전.

macOS: `13.3` 이상 버전.

Linux: `ubuntu-22.04+`에서 테스트됨

하드웨어:
특별한 요구 사항은 없습니다. 리소스 사용량은 메인 창의 고급 설정을 통해 사용자 지정할 수 있습니다.

현재 `Linux`에서는 오디오 파일 청취가 지원되지 않습니다.

또한 시작하기 전에 다음 환경 변수를 설정해야 할 수도 있습니다.

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## Ollama로 요약 설정하기

1. Ollama 설치

https://ollama.com 에서 Ollama를 다운로드하여 설치하세요.

2. 모델 설치

설치가 끝나면 요약에 사용할 모델을 설정하세요. 예를 들어 터미널에서 다음 명령을 실행하면 `llama3.1`을 설치할 수 있습니다.

```console
ollama run llama3.1
```

3. 요약 활성화

모델 설치가 끝나면 Ollama 앱을 여세요. `추가 옵션`으로 이동하여 트랜스크립션 단계 직전에 요약을 활성화하세요. 설정은 기본값 그대로 두어도 됩니다.

_작동하는지 확인하려면 반드시 'Run check`를 실행하세요_

이제 끝입니다! Ollama에서 요약 기능이 활성화됩니다.

## 안정적인 타임스탬프 (자막 / 영화)

Vibe는 긴 콘텐츠에서 더 정밀한 자막 타이밍을 위한 안정적인 타임스탬프 모드를 제공합니다.

1. `추가 옵션`을 여세요.
2. `안정적인 타임스탬프`를 활성화하세요.
3. 메시지가 표시되면 VAD 모델을 다운로드하세요.

참고:

- 이 모드는 정확도를 우선하며 일반적인 트랜스크립션보다 약 `4x` 느립니다.
- 자막 제작과 영화/동영상 트랜스크립트 타이밍에 적합합니다.
- 기본으로 사용되는 VAD 모델: `ggml-silero-v6.2.0.bin`
- 원본 모델 출처: `https://huggingface.co/ggml-org/whisper-vad`

## 영어로 번역하기

영어로 번역하는 기능은 Whisper `small`, `medium`, `large` 모델에서만 작동합니다. Whisper `large-v3-turbo`에서는 작동하지 않습니다.

번역이 필요하다면 [모델 문서](/vibe/docs#models)에서 지원되는 모델을 다운로드하세요.

## 수동 설치 🛠️

`MacOS Apple silicon`: [릴리스](https://github.com/thewh1teagle/vibe/releases)에서 `aarch64.dmg` 파일을 설치하세요. **처음 실행할 때는 반드시 마우스 오른쪽 버튼으로 클릭한 뒤 애플리케이션에서 열어야 합니다**

`MacOS Intel`: [릴리스](https://github.com/thewh1teagle/vibe/releases)에서 `x64.dmg` 파일을 설치하세요. **처음 실행할 때는 반드시 마우스 오른쪽 버튼으로 클릭한 뒤 애플리케이션에서 열어야 합니다**

`Windows`: [릴리스](https://github.com/thewh1teagle/vibe/releases)에서 `.exe` 파일을 설치하세요.

`Linux`: [릴리스](https://github.com/thewh1teagle/vibe/releases)에서 `.deb` 파일을 설치하세요 (`Arch` 사용자는 [debtap](https://aur.archlinux.org/packages/debtap)을 사용할 수 있습니다)

_모든 모델은 수동 설치가 가능합니다. [사전 빌드된 모델](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)을 참고하세요_

## 오프라인 설치 💾

Vibe의 오프라인 설치는 간단합니다. 앱을 열고 다운로드를 취소한 뒤 설정 내 `사용자 정의` 섹션으로 이동하세요.

_모든 모델은 수동 설치가 가능합니다. 설정 또는 [사전 빌드된 모델](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)을 참고하세요_

## macOS에서 더 빠른 트랜스크립션 (2-3배) 🌟

1. https://huggingface.co/ggerganov/whisper.cpp/tree/main 에서 사용 중인 모델에 맞는 `.mlcmodelc.zip` 파일을 다운로드하세요.

- 예: `ggml-medium-encoder.mlmodelc.zip`은 `ggml-medium-encoder.bin`에 대응합니다.

2. Vibe 설정에서 모델 폴더를 여세요.
3. `.mlcmodel.c` 파일을 `.bin` 파일과 같은 위치에 있도록 모델 폴더로 드래그 앤 드롭하세요.
4. 파일을 트랜스크립션하세요. 해당 모델을 처음 사용할 때는 모델을 컴파일하는 과정 때문에 시간이 더 걸립니다. 이후에는 더 빨라집니다.

## `msvc140.dll` 파일을 찾을 수 없다는 오류 ❌

[vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)를 다운로드하여 설치하세요.

## Vibe에서 모델을 다운로드하는 특별 링크

자신의 웹사이트에 링크를 추가해 사용자가 웹사이트에서 곧바로 Vibe로 모델을 다운로드하도록 할 수 있습니다.

URL은 다음과 같은 형식이어야 합니다.

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## Linux 서버에서 사용하기

Linux 서버에서 Vibe를 사용하려면 가상 디스플레이를 설치해야 합니다.

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
