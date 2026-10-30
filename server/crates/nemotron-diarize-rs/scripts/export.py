# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "safetensors", "gguf>=0.10.0", "huggingface-hub>=0.20"]
# ///
"""Export nvidia/Nemotron-3-Diarization (HF safetensors) to a GGUF for nemotron-diarize-rs.

    uv run scripts/export.py --out nemotron-3-diarization-F32.gguf
    uv run scripts/export.py --dtype f16 --out nemotron-3-diarization-F16.gguf
    uv run scripts/export.py --dtype q8_0 --out nemotron-3-diarization-Q8_0.gguf

No torch or NeMo needed: the HF checkpoint is read straight from its safetensors.

Tensors keep their HF names, with one layout change: the upsampler's Conv1d
weight `(out, in, k)` is stored as `(k, out, in)` so the runtime can take each
tap as a contiguous `[in, out]` matrix view.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import gguf
import numpy as np
from gguf import GGMLQuantizationType
from huggingface_hub import snapshot_download
from safetensors.numpy import load_file

ARCH = "nemotron3_diar"
UPSAMPLER_CONV = "model.upsampler.conv.weight"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", default="nvidia/Nemotron-3-Diarization", help="HF repo id or a local directory")
    parser.add_argument("--revision", default=None)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--dtype", choices=["f32", "f16", "q8_0"], default="f32", help="dtype of the 2D matmul weights (q8_0 falls back to f16 for rows not divisible by 32)")
    args = parser.parse_args()

    started = time.perf_counter()
    source = Path(args.repo)
    if not source.is_dir():
        print(f"[export] downloading {args.repo}")
        source = Path(
            snapshot_download(
                args.repo,
                revision=args.revision,
                allow_patterns=["config.json", "processor_config.json", "*.safetensors"],
            )
        )
    config = json.loads((source / "config.json").read_text())
    processor = json.loads((source / "processor_config.json").read_text())
    audio, head, streaming = config["audio_config"], config["head_config"], config["streaming_config"]
    features = processor["feature_extractor"]

    rope = audio.get("rope_parameters") or {}
    if rope.get("rope_type", "default") != "default":
        raise SystemExit(f"unsupported rope_type {rope['rope_type']!r}")
    if float(rope.get("partial_rotary_factor", audio.get("partial_rotary_factor", 1.0))) != 1.0:
        raise SystemExit("only partial_rotary_factor == 1.0 is supported")
    if audio["hidden_act"] != "gelu":
        raise SystemExit(f"unsupported hidden_act {audio['hidden_act']!r}")
    if audio.get("num_key_value_heads", audio["num_attention_heads"]) != audio["num_attention_heads"]:
        raise SystemExit("grouped-query attention is not supported")

    out = args.out or Path(f"nemotron-3-diarization-{args.dtype.upper()}.gguf")
    writer = gguf.GGUFWriter(str(out), ARCH)
    writer.add_name("Nemotron-3-Diarization")
    writer.add_string("general.source.repo", args.repo)

    def u32(key: str, value) -> None:
        writer.add_uint32(f"{ARCH}.{key}", int(value))

    def f32(key: str, value) -> None:
        writer.add_float32(f"{ARCH}.{key}", float(value))

    u32("audio.hidden_size", audio["hidden_size"])
    u32("audio.intermediate_size", audio["intermediate_size"])
    u32("audio.num_layers", audio["num_hidden_layers"])
    u32("audio.num_heads", audio["num_attention_heads"])
    u32("audio.num_mels", audio["num_mel_bins"])
    u32("audio.subsampling_factor", audio["subsampling_factor"])
    f32("audio.rope_theta", rope.get("rope_theta", 10000.0))
    u32("head.hidden_size", head["hidden_size"])
    u32("head.num_speakers", head["num_speakers"])
    u32("offline.chunk_length", config["chunk_length"])
    u32("offline.chunk_right_context", config["chunk_right_context"])
    u32("offline.fifo_length", config["fifo_length"])
    u32("offline.speaker_cache_update_period", config["speaker_cache_update_period"])
    u32("cache.length", streaming["speaker_cache_length"])
    u32("cache.silence_frames_per_speaker", streaming["speaker_cache_silence_frames_per_speaker"])
    f32("cache.prediction_score_threshold", streaming["prediction_score_threshold"])
    f32("cache.latest_frames_score_boost", streaming["latest_frames_score_boost"])
    f32("cache.strong_boost_rate", streaming["strong_boost_rate"])
    f32("cache.weak_boost_rate", streaming["weak_boost_rate"])
    f32("cache.min_positive_scores_rate", streaming["min_positive_scores_rate"])
    u32("mel.sample_rate", features["sampling_rate"])
    u32("mel.n_fft", features["n_fft"])
    u32("mel.win_length", features["win_length"])
    u32("mel.hop_length", features["hop_length"])
    f32("mel.preemphasis", features["preemphasis"])

    tensors: dict[str, np.ndarray] = {}
    for file in sorted(source.glob("*.safetensors")):
        tensors.update(load_file(str(file)))
    if UPSAMPLER_CONV not in tensors:
        raise SystemExit(f"checkpoint has no {UPSAMPLER_CONV}; tensor names: {sorted(tensors)[:12]} ...")

    total_bytes = 0
    for name in sorted(tensors):
        data = np.asarray(tensors[name])
        if data.dtype != np.float32:
            data = data.astype(np.float32)
        if name == UPSAMPLER_CONV:
            data = np.ascontiguousarray(data.transpose(2, 0, 1))
        if len(name) >= 64:
            raise SystemExit(f"tensor name too long for GGUF: {name}")
        is_matrix = name != UPSAMPLER_CONV and data.ndim == 2 and name.endswith(".weight")
        if args.dtype == "q8_0" and is_matrix and data.shape[-1] % 32 == 0:
            shape = data.shape
            data = gguf.quants.quantize(data, GGMLQuantizationType.Q8_0)
            writer.add_tensor(name, data, raw_dtype=GGMLQuantizationType.Q8_0)
            label = "q8_0"
        else:
            if args.dtype != "f32" and is_matrix:
                data = data.astype(np.float16)
            shape = data.shape
            writer.add_tensor(name, data)
            label = str(data.dtype)
        total_bytes += data.nbytes
        print(f"[export] {name:56s} {label:8s} {tuple(shape)}")

    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()
    elapsed = time.perf_counter() - started
    print(f"[export] wrote {out} ({len(tensors)} tensors, {total_bytes / 1e6:.1f} MB) in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
