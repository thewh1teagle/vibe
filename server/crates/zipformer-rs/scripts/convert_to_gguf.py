# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = [
#   "torch==2.5.1",
#   "numpy",
#   "gguf>=0.10",
#   "sentencepiece",
#   "protobuf",
#   "huggingface-hub",
# ]
# ///
"""Convert an icefall Zipformer2 transducer checkpoint into ONE GGUF for zipformer-rs.

    uv run convert_to_gguf.py thewh1teagle/zipformer2-66m-streaming-he out-f32.gguf
    uv run convert_to_gguf.py /path/to/repo_dir out-q8_0.gguf --quantize q8_0
    uv run convert_to_gguf.py --verify out-f32.gguf /path/to/repo_dir

Source: a directory (or HF repo id) holding `model.pt`, a dict with
    "model"      icefall AsrModel state dict (encoder_embed / encoder / decoder / joiner)
    "config"     the hyperparameters (comma-separated strings for per-stack values)
    "tokenizer"  the serialized SentencePiece model (same bytes as bpe.model)
`model.pt` is read with torch.load(weights_only=True): tensors and plain containers only.

Tensor names
    ggml caps tensor names at 63 bytes and the longest state-dict key is 84, so
    names are shortened by fixed prefix rules; everything after the prefix is the
    state-dict name, verbatim:

        encoder_embed.X                          -> embed.X
        encoder.encoders.0.layers.J.X            -> enc.0.J.X     (stack 0 has no downsampling wrapper)
        encoder.encoders.I.encoder.layers.J.X    -> enc.I.J.X     (I >= 1)
        encoder.encoders.I.downsample.bias       -> enc.I.downsample.bias
        encoder.encoders.I.out_combiner.X        -> enc.I.out_combiner.X
        encoder.downsample_output.bias           -> enc.downsample_output.bias
        decoder.X, joiner.X                      -> unchanged

Tensor data
    No folding, no transposes: values are the checkpoint's, in PyTorch layout
    (Linear [out, in]; Conv [out, in/groups, k...]). GGUF stores dims reversed, so
    ggml sees ne = [in, out] / [k, in/groups, out], the same as the Parakeet GGUFs.
    0-dim tensors (BiasNorm `log_scale`) are stored with shape [1].

    Dropped (never read at inference):
        simple_am_proj.*, simple_lm_proj.*   pruned-RNN-T training heads
        *.layers.J.bypass_scale              dead parameter on the layer itself (icefall
                                             "TODO: remove it"); the live ones are
                                             bypass.bypass_scale and bypass_mid.bypass_scale

Quantization (--quantize q8_0), same bucket policy as parakeet-rs/scripts/quantize.py:
    2-D Linear / Embedding weights whose input dim is a multiple of 32 -> Q8_0;
    everything else (convs, biases, scales, norms, the few odd-width Linears) stays F32.

Metadata: see `write_metadata` below; plans/zipformer/spec.md lists every key.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np

ARCH = "zipformer2"
PREFIX = "stt.zipformer"
TOKEN_TYPE_NORMAL, TOKEN_TYPE_UNKNOWN, TOKEN_TYPE_CONTROL, TOKEN_TYPE_UNUSED, TOKEN_TYPE_BYTE = 1, 2, 3, 5, 6
GGML_MAX_NAME = 64

DROP = re.compile(r"^(simple_am_proj|simple_lm_proj)\.|\.layers\.\d+\.bypass_scale$")
RENAMES = [
    (re.compile(r"^encoder_embed\."), "embed."),
    (re.compile(r"^encoder\.encoders\.(\d+)\.(?:encoder\.)?layers\.(\d+)\."), r"enc.\1.\2."),
    (re.compile(r"^encoder\.encoders\.(\d+)\.(downsample|out_combiner)\."), r"enc.\1.\2."),
    (re.compile(r"^encoder\.downsample_output\."), "enc.downsample_output."),
]
Q8 = re.compile(r"(\.weight)$")


def gguf_name(key: str) -> str | None:
    """state-dict key -> GGUF tensor name, or None when the tensor is dropped."""
    if DROP.search(key):
        return None
    for pattern, repl in RENAMES:
        new, n = pattern.subn(repl, key)
        if n:
            key = new
            break
    if len(key.encode()) >= GGML_MAX_NAME:
        raise ValueError(f"tensor name too long for ggml: {key}")
    return key


def ints(value) -> list[int]:
    return [int(v) for v in str(value).split(",")]


def per_stack(value, n: int) -> list[int]:
    v = ints(value)
    return v * n if len(v) == 1 else v


def resolve_source(spec: str) -> Path:
    path = Path(spec)
    if path.is_dir():
        return path
    from huggingface_hub import snapshot_download

    return Path(snapshot_download(spec, allow_patterns=["model.pt", "bpe.model", "README.md"]))


def load_checkpoint(src: Path):
    import torch

    ck = torch.load(src / "model.pt", map_location="cpu", weights_only=True)
    for key in ("model", "config", "tokenizer"):
        if key not in ck:
            raise KeyError(f"model.pt has no {key!r} entry (found {list(ck)})")
    sd = {k: v.detach().to(torch.float32).numpy() for k, v in ck["model"].items()}
    return sd, ck["config"], bytes(ck["tokenizer"])


def check_shapes(sd: dict, cfg: dict) -> None:
    """The config must describe the tensors; fail loudly when it does not."""
    dims = ints(cfg["encoder_dim"])
    n = len(dims)
    layers, heads = ints(cfg["num_encoder_layers"]), ints(cfg["num_heads"])
    ff, kernels = ints(cfg["feedforward_dim"]), ints(cfg["cnn_module_kernel"])
    q, v, p = (per_stack(cfg[k], n) for k in ("query_head_dim", "value_head_dim", "pos_head_dim"))
    ds = ints(cfg["downsampling_factor"])

    def expect(name, shape):
        if name not in sd:
            raise KeyError(f"state dict is missing {name}")
        if tuple(sd[name].shape) != tuple(shape):
            raise ValueError(f"{name}: expected {tuple(shape)}, found {tuple(sd[name].shape)}")

    expect("encoder_embed.out.weight", (dims[0], 128 * ((((cfg["feature_dim"] - 1) // 2) - 1) // 2)))
    for i in range(n):
        base = f"encoder.encoders.{i}." + ("" if ds[i] == 1 else "encoder.")
        for j in range(layers[i]):
            L = f"{base}layers.{j}."
            expect(L + "self_attn_weights.in_proj.weight", ((2 * q[i] + p[i]) * heads[i], dims[i]))
            expect(L + "self_attn_weights.linear_pos.weight", (p[i] * heads[i], cfg["pos_dim"]))
            expect(L + "self_attn1.in_proj.weight", (v[i] * heads[i], dims[i]))
            expect(L + "feed_forward1.in_proj.weight", (ff[i] * 3 // 4, dims[i]))
            expect(L + "feed_forward2.in_proj.weight", (ff[i], dims[i]))
            expect(L + "feed_forward3.in_proj.weight", (ff[i] * 5 // 4, dims[i]))
            expect(L + "nonlin_attention.in_proj.weight", (3 * (3 * dims[i] // 4), dims[i]))
            expect(L + "conv_module1.depthwise_conv.chunkwise_conv.weight", (dims[i], 1, kernels[i]))
            expect(L + "conv_module1.depthwise_conv.causal_conv.weight", (dims[i], 1, (kernels[i] + 1) // 2))
        assert f"{base}layers.{layers[i]}.norm.bias" not in sd, f"stack {i} has more layers than the config says"
        if ds[i] != 1:
            expect(f"encoder.encoders.{i}.downsample.bias", (ds[i],))
    expect("encoder.downsample_output.bias", (2,))
    expect("decoder.embedding.weight", (cfg["vocab_size"], cfg["decoder_dim"]))
    expect("decoder.conv.weight", (cfg["decoder_dim"], 4, cfg["context_size"]))
    expect("joiner.encoder_proj.weight", (cfg["joiner_dim"], max(dims)))
    expect("joiner.output_linear.weight", (cfg["vocab_size"], cfg["joiner_dim"]))
    if not cfg["causal"]:
        raise ValueError("only causal (ChunkCausalDepthwiseConv1d) checkpoints are supported")


def tokenizer_payload(proto: bytes, cfg: dict) -> dict:
    import sentencepiece as spm
    from sentencepiece import sentencepiece_model_pb2 as pb

    sp = spm.SentencePieceProcessor()
    sp.LoadFromSerializedProto(proto)
    model = pb.ModelProto()
    model.ParseFromString(proto)
    if sp.get_piece_size() != cfg["vocab_size"]:
        raise ValueError(f"tokenizer has {sp.get_piece_size()} pieces, config says {cfg['vocab_size']}")
    tokens, scores, types = [], [], []
    for i in range(sp.get_piece_size()):
        tokens.append(sp.id_to_piece(i))
        scores.append(float(sp.get_score(i)))
        if sp.is_unknown(i):
            types.append(TOKEN_TYPE_UNKNOWN)
        elif sp.is_control(i) or tokens[-1] in ("<blk>", "<sos/eos>"):
            types.append(TOKEN_TYPE_CONTROL)
        elif sp.is_unused(i):
            types.append(TOKEN_TYPE_UNUSED)
        elif sp.is_byte(i):
            types.append(TOKEN_TYPE_BYTE)
        else:
            types.append(TOKEN_TYPE_NORMAL)
    blank = sp.piece_to_id("<blk>")
    if blank != cfg["blank_id"]:
        raise ValueError(f"<blk> is piece {blank}, config blank_id is {cfg['blank_id']}")
    kind = {1: "unigram", 2: "bpe"}.get(model.trainer_spec.model_type, "bpe")
    return {
        "model": kind,
        "tokens": tokens,
        "scores": scores,
        "types": types,
        "blank_id": blank,
        "unk_id": sp.piece_to_id("<unk>"),
        "sos_eos_id": sp.piece_to_id("<sos/eos>"),
    }


def write_metadata(w, cfg: dict, tok: dict, repo_id: str | None, n_params: int, file_type) -> None:
    dims = ints(cfg["encoder_dim"])
    n = len(dims)
    w.add_string("general.name", "Zipformer2 66M streaming Hebrew")
    w.add_string("general.basename", "zipformer2-streaming")
    w.add_string("general.size_label", f"{n_params // 1_000_000}M")
    w.add_string("general.license", "cc-by-4.0")
    if repo_id:
        w.add_string("general.repo_url", f"https://huggingface.co/{repo_id}")
    w.add_string("general.source.url", "https://github.com/k2-fsa/icefall")
    w.add_uint32("general.file_type", int(file_type))
    w.add_array("general.languages", ["he"])
    w.add_string("stt.variant", "zipformer2-66m-streaming-he")
    w.add_bool("stt.capability.streaming", bool(cfg["causal"]))
    w.add_string(f"{PREFIX}.head_kind", "transducer")

    e = f"{PREFIX}.encoder"
    w.add_uint32(f"{e}.n_stacks", n)
    w.add_array(f"{e}.n_layers", ints(cfg["num_encoder_layers"]))
    w.add_array(f"{e}.dim", dims)
    w.add_array(f"{e}.unmasked_dim", ints(cfg["encoder_unmasked_dim"]))  # training only
    w.add_array(f"{e}.downsampling_factor", ints(cfg["downsampling_factor"]))
    w.add_array(f"{e}.n_heads", ints(cfg["num_heads"]))
    w.add_array(f"{e}.feedforward_dim", ints(cfg["feedforward_dim"]))
    w.add_array(f"{e}.cnn_module_kernel", ints(cfg["cnn_module_kernel"]))
    w.add_array(f"{e}.query_head_dim", per_stack(cfg["query_head_dim"], n))
    w.add_array(f"{e}.value_head_dim", per_stack(cfg["value_head_dim"], n))
    w.add_array(f"{e}.pos_head_dim", per_stack(cfg["pos_head_dim"], n))
    w.add_uint32(f"{e}.pos_dim", int(cfg["pos_dim"]))
    w.add_uint32(f"{e}.output_dim", max(dims))
    w.add_uint32(f"{e}.output_downsampling_factor", 2)
    w.add_bool(f"{e}.causal", bool(cfg["causal"]))
    # Conv2dSubsampling (fixed by the recipe): T1 = (T - 7) // 2, then /2 at the output.
    w.add_array(f"{e}.embed_channels", [8, 32, 128])
    w.add_uint32(f"{e}.embed_convnext_kernel", 7)
    w.add_uint32(f"{e}.subsampling_factor", 4)
    # Chunk sizes the model was trained with (50 Hz frames; -1 = full context) and
    # the two streaming set-ups it shipped with.
    w.add_array(f"{e}.train_chunk_size", ints(cfg["chunk_size"]))
    w.add_array(f"{e}.train_left_context_frames", ints(cfg["left_context_frames"]))
    w.add_int32(f"{e}.eval_chunk_size", int(cfg["eval_chunk_size"]))
    w.add_int32(f"{e}.eval_left_context_frames", int(cfg["eval_left_context_frames"]))
    w.add_int32(f"{e}.onnx_chunk_size", 64)
    w.add_int32(f"{e}.onnx_left_context_frames", 256)
    # Recommended offline mode (plans/zipformer/spec.md): full context + 30 padded frames.
    w.add_int32(f"{e}.chunk_size", -1)
    w.add_int32(f"{e}.left_context_frames", -1)
    w.add_uint32(f"{e}.tail_pad_frames", 30)

    w.add_uint32(f"{PREFIX}.decoder.dim", int(cfg["decoder_dim"]))
    w.add_uint32(f"{PREFIX}.decoder.context_size", int(cfg["context_size"]))
    w.add_uint32(f"{PREFIX}.decoder.conv_groups", int(cfg["decoder_dim"]) // 4)
    w.add_uint32(f"{PREFIX}.decoder.vocab", int(cfg["vocab_size"]))
    w.add_uint32(f"{PREFIX}.joiner.dim", int(cfg["joiner_dim"]))
    w.add_string(f"{PREFIX}.joiner.activation", "tanh")
    w.add_string(f"{PREFIX}.search.method", "greedy")
    w.add_uint32(f"{PREFIX}.search.max_symbols_per_frame", 1)
    w.add_float32(f"{PREFIX}.search.frame_seconds", 0.04)

    w.add_string("stt.frontend.type", "kaldi_fbank")
    w.add_uint32("stt.frontend.num_mels", int(cfg["feature_dim"]))
    w.add_uint32("stt.frontend.sample_rate", 16000)
    w.add_uint32("stt.frontend.n_fft", 512)
    w.add_uint32("stt.frontend.win_length", 400)
    w.add_uint32("stt.frontend.hop_length", 160)
    w.add_string("stt.frontend.window", "povey")
    w.add_string("stt.frontend.normalize", "none")
    w.add_float32("stt.frontend.dither", 0.0)
    w.add_float32("stt.frontend.pre_emphasis", 0.97)
    w.add_float32("stt.frontend.f_min", 20.0)
    w.add_float32("stt.frontend.f_max", 7600.0)
    w.add_bool("stt.frontend.snip_edges", False)
    w.add_bool("stt.frontend.remove_dc_offset", True)
    w.add_bool("stt.frontend.use_power", True)
    w.add_bool("stt.frontend.use_energy", False)
    w.add_string("stt.frontend.mel_scale", "kaldi")
    w.add_float32("stt.frontend.log_floor", float(np.finfo(np.float32).eps))
    w.add_float32("stt.frontend.sample_scale", 1.0)  # samples in [-1, 1], NOT int16 range
    w.add_float32("stt.frontend.pad_value", float(np.log(1e-10)))

    w.add_string("tokenizer.ggml.model", tok["model"])
    w.add_uint32("tokenizer.ggml.blank_token_id", tok["blank_id"])
    w.add_uint32("tokenizer.ggml.unknown_token_id", tok["unk_id"])
    w.add_uint32("tokenizer.ggml.bos_token_id", tok["sos_eos_id"])
    w.add_uint32("tokenizer.ggml.eos_token_id", tok["sos_eos_id"])
    # Bulk arrays last, as the Parakeet converter does.
    w.add_array("tokenizer.ggml.tokens", tok["tokens"])
    w.add_array("tokenizer.ggml.scores", tok["scores"])
    w.add_array("tokenizer.ggml.token_type", tok["types"])


def convert(src_spec: str, out_path: Path, quantize: str) -> None:
    import gguf
    from gguf import GGMLQuantizationType, LlamaFileType
    from gguf.quants import quantize as gguf_quantize

    src = resolve_source(src_spec)
    sd, cfg, proto = load_checkpoint(src)
    check_shapes(sd, cfg)
    tok = tokenizer_payload(proto, cfg)
    kept = {k: v for k, v in sd.items() if gguf_name(k) is not None}
    n_params = sum(int(v.size) for v in kept.values())
    file_type = LlamaFileType.MOSTLY_Q8_0 if quantize == "q8_0" else LlamaFileType.ALL_F32
    repo_id = src_spec if not Path(src_spec).is_dir() else None

    out_path.parent.mkdir(parents=True, exist_ok=True)
    w = gguf.GGUFWriter(str(out_path), ARCH)
    write_metadata(w, cfg, tok, repo_id, n_params, file_type)

    counts: dict[str, int] = {}
    seen: set[str] = set()
    for key, arr in kept.items():
        name = gguf_name(key)
        if name in seen:
            raise ValueError(f"duplicate GGUF tensor name {name}")
        seen.add(name)
        arr = np.ascontiguousarray(arr, dtype=np.float32)
        if arr.ndim == 0:
            arr = arr.reshape(1)
        if quantize == "q8_0" and arr.ndim == 2 and Q8.search(name) and arr.shape[-1] % 32 == 0:
            w.add_tensor(name, gguf_quantize(arr, GGMLQuantizationType.Q8_0), raw_dtype=GGMLQuantizationType.Q8_0)
            kind = "Q8_0"
        else:
            w.add_tensor(name, arr)
            kind = "F32"
        counts[kind] = counts.get(kind, 0) + 1
    w.write_header_to_file()
    w.write_kv_data_to_file()
    w.write_tensors_to_file()
    w.close()
    dropped = len(sd) - len(kept)
    print(f"wrote {out_path}: {len(kept)} tensors {counts}, {n_params} parameters, "
          f"{dropped} state-dict entries dropped, {out_path.stat().st_size / 1e6:.1f} MB")


def verify(gguf_path: Path, src_spec: str) -> int:
    """Read the GGUF back and compare every tensor with the checkpoint."""
    from gguf import GGMLQuantizationType, GGUFReader
    from gguf.quants import dequantize

    sd, cfg, proto = load_checkpoint(resolve_source(src_spec))
    reader = GGUFReader(str(gguf_path))
    tensors = {t.name: t for t in reader.tensors}
    expected = {gguf_name(k): v for k, v in sd.items() if gguf_name(k) is not None}
    missing = sorted(set(expected) - set(tensors))
    extra = sorted(set(tensors) - set(expected))
    worst_q, exact, quantized, bad = 0.0, 0, 0, []
    for name, ref in expected.items():
        if name not in tensors:
            continue
        t = tensors[name]
        ref = ref.reshape(1) if ref.ndim == 0 else ref
        shape = tuple(int(d) for d in reversed(t.shape))
        if shape != ref.shape:
            bad.append(f"{name}: shape {shape} != {ref.shape}")
            continue
        if t.tensor_type == GGMLQuantizationType.F32:
            if np.array_equal(np.asarray(t.data).reshape(shape), ref):
                exact += 1
            else:
                bad.append(f"{name}: F32 data differs")
        else:
            got = dequantize(np.asarray(t.data), t.tensor_type).reshape(shape)
            err = float(np.abs(got - ref).max() / max(float(np.abs(ref).max()), 1e-12))
            worst_q = max(worst_q, err)
            quantized += 1
            if err > 0.01:
                bad.append(f"{name}: {t.tensor_type.name} relative error {err:.4f}")
    tok = tokenizer_payload(proto, cfg)
    got_tokens = reader.fields["tokenizer.ggml.tokens"].contents()
    if got_tokens != tok["tokens"]:
        bad.append("tokenizer.ggml.tokens differs from the SentencePiece model")
    arch = reader.fields["general.architecture"].contents()
    print(f"{gguf_path.name}: arch={arch} tensors={len(tensors)} metadata_keys={len(reader.fields)} "
          f"F32 bit-exact={exact} quantized={quantized} (worst max-abs error / max-abs = {worst_q:.5f}) "
          f"tokens={len(got_tokens)}")
    for line in [*(f"missing {m}" for m in missing), *(f"unexpected {m}" for m in extra), *bad]:
        print("  FAIL", line)
    ok = not (missing or extra or bad)
    print("  round-trip OK" if ok else "  round-trip FAILED")
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("source", help="HF repo id or directory with model.pt (with --verify: the .gguf)")
    ap.add_argument("out_path", help="output .gguf (with --verify: the source repo id / directory)")
    ap.add_argument("--quantize", choices=["f32", "q8_0"], default="f32")
    ap.add_argument("--verify", action="store_true", help="read a GGUF back and compare it with the checkpoint")
    args = ap.parse_args(argv[1:])
    if args.verify:
        return verify(Path(args.source), args.out_path)
    convert(args.source, Path(args.out_path), args.quantize)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
