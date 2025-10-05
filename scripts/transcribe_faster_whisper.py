#!/usr/bin/env python3
"""
Simple faster-whisper transcription script.
Outputs JSON to stdout.
"""
import sys
import json
import os
from faster_whisper import WhisperModel

def main():
    if len(sys.argv) != 3:
        print("Usage: python3 transcribe.py <model> <audio_file>", file=sys.stderr)
        sys.exit(1)

    model_name = sys.argv[1]
    audio_file = sys.argv[2]

    print(f"CWD: {os.getcwd()}", file=sys.stderr)
    print(f"Audio file: {audio_file}", file=sys.stderr)
    print(f"Absolute path: {os.path.abspath(audio_file)}", file=sys.stderr)

    if not os.path.exists(audio_file):
        print(f"File does not exist: {audio_file}", file=sys.stderr)
        sys.exit(1)

    model = WhisperModel(model_name, device="cpu", compute_type="int8")

    segments, info = model.transcribe(audio_file, beam_size=5)

    result = {
        "segments": [
            {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text
            }
            for segment in segments
        ]
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
