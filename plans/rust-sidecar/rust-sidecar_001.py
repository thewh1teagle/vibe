# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///

import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / ".models" / "ggml-tiny.en.bin"
MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"
SAMPLE = ROOT / "samples" / "short.wav"
MP4_SAMPLE = ROOT / "samples" / "short.mp4"
DIAR_MODEL = ROOT / ".models" / "diar_streaming_sortformer_4spk-v2.1.onnx"
DIAR_SAMPLE = ROOT / "samples" / "6_speakers.wav"


def run(args: list[str], **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, text=True, **kwargs)


def ensure_model():
    MODEL.parent.mkdir(exist_ok=True)
    if MODEL.exists() and MODEL.stat().st_size > 1_000_000:
        return
    print(f"downloading {MODEL_URL}")
    urllib.request.urlretrieve(MODEL_URL, MODEL)


def main():
    ensure_model()
    run(["cargo", "build", "-p", "vibe-server"])

    proc = subprocess.Popen(
        [str(ROOT / "target" / "debug" / "vibe-server"), "serve", "--port", "0", "--exit-with-parent", "false"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        ready_line = proc.stdout.readline().strip()
        ready = json.loads(ready_line)
        port = ready["port"]
        base = f"http://127.0.0.1:{port}"

        req = urllib.request.Request(
            f"{base}/v1/models/load",
            data=json.dumps({"path": str(MODEL), "no_gpu": True}).encode(),
            headers={"content-type": "application/json"},
            method="POST",
        )
        print(urllib.request.urlopen(req, timeout=120).read().decode())

        boundary = "vibe-sidecar-boundary"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="response_format"\r\n\r\n'
            "verbose_json\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="short.wav"\r\n'
            "Content-Type: audio/wav\r\n\r\n"
        ).encode() + SAMPLE.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
        req = urllib.request.Request(
            f"{base}/v1/audio/transcriptions",
            data=body,
            headers={"content-type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        result = json.loads(urllib.request.urlopen(req, timeout=180).read().decode())
        print(json.dumps(result, indent=2))
        if not result.get("text"):
            raise SystemExit("transcription returned empty text")

        stream_events = transcribe_stream(base)
        print("\n".join(stream_events))
        if not any('"type":"result"' in event or '"type": "result"' in event for event in stream_events):
            raise SystemExit("streaming transcription did not return a result event")

        assert_stable_timestamp_validation(base)
        if shutil.which("ffmpeg") and MP4_SAMPLE.exists():
            mp4_result = transcribe_file(base, MP4_SAMPLE)
            print(json.dumps(mp4_result, indent=2))
            if not mp4_result.get("text"):
                raise SystemExit("mp4 transcription returned empty text")
        if DIAR_MODEL.exists() and DIAR_SAMPLE.exists():
            diar_result = transcribe_file(base, DIAR_SAMPLE, diarize_model=DIAR_MODEL)
            speaker_count = sum(1 for segment in diar_result.get("segments", []) if "speaker" in segment)
            print(json.dumps({"diarized_segments": speaker_count}, indent=2))
            if speaker_count == 0:
                raise SystemExit("diarization returned no speaker labels")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def transcribe_file(base: str, path: Path, diarize_model: Path | None = None) -> dict:
    boundary = "vibe-sidecar-file-boundary"
    fields = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="response_format"\r\n\r\n'
        "verbose_json\r\n"
    )
    if diarize_model is not None:
        fields += (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="diarize_model"\r\n\r\n'
            f"{diarize_model}\r\n"
        )
    body = (
        fields +
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{base}/v1/audio/transcriptions",
        data=body,
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    return json.loads(urllib.request.urlopen(req, timeout=180).read().decode())


def assert_stable_timestamp_validation(base: str):
    boundary = "vibe-sidecar-vad-boundary"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="stable_timestamps"\r\n\r\n'
        "true\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="short.wav"\r\n'
        "Content-Type: audio/wav\r\n\r\n"
    ).encode() + SAMPLE.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{base}/v1/audio/transcriptions",
        data=body,
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=180)
    except urllib.error.HTTPError as err:
        if err.code != 400:
            raise
        body = err.read().decode()
        if "vad_model" not in body:
            raise SystemExit(f"unexpected stable timestamp validation body: {body}")
        return
    raise SystemExit("stable timestamp validation unexpectedly succeeded")


def transcribe_stream(base: str) -> list[str]:
    boundary = "vibe-sidecar-stream-boundary"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="stream"\r\n\r\n'
        "true\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="short.wav"\r\n'
        "Content-Type: audio/wav\r\n\r\n"
    ).encode() + SAMPLE.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{base}/v1/audio/transcriptions",
        data=body,
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as response:
        if response.headers.get_content_type() != "application/x-ndjson":
            raise SystemExit(f"unexpected stream content type: {response.headers.get_content_type()}")
        return [line.decode().strip() for line in response if line.strip()]


if __name__ == "__main__":
    main()
