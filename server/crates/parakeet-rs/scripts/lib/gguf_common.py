"""GGUF helpers shared across per-family converters.

Scope is deliberately small: just the pieces that every converter
needs regardless of model family. Family-specific logic (tensor
catalogs, hparam maps, special-token handling) stays in
scripts/convert-<family>.py.

Python is conversion-only. The only dtype encoding this module
performs is F32 / F16 / BF16 — block quantization lives entirely in
tools/transcribe-quantize/ (see docs/tools/quantization.md).
"""

from __future__ import annotations

import numpy as np
import gguf
from gguf import GGMLQuantizationType


# GGUF filename convention: `<slug>-<QUANT>.gguf`, matching llama.cpp
# (e.g. `parakeet-tdt-0.6b-v2-Q5_K_M.gguf`). The slug is derived from
# the HF repo id (`nvidia/parakeet-tdt-0.6b-v2` → `parakeet-tdt-0.6b-v2`).
# Quant is the uppercase preset name from transcribe-quantize: F32, F16,
# BF16, Q8_0, Q6_K, Q5_K_M, Q4_K_M, etc.
def slug_from_repo_id(repo_id: str) -> str:
    """`org/name` → `name`. `name` alone passes through."""
    s = repo_id.strip().strip("/")
    if not s:
        raise ValueError("repo_id is empty")
    return s.rsplit("/", 1)[-1]


def gguf_name(slug: str, quant: str) -> str:
    """Canonical GGUF filename: `<slug>-<QUANT>.gguf` (quant uppercase)."""
    if not slug:
        raise ValueError("slug is empty")
    if not quant:
        raise ValueError("quant is empty")
    return f"{slug}-{quant.upper()}.gguf"


def add_general_identity(
    writer: gguf.GGUFWriter,
    *,
    name: str,
    basename: str,
    size_label: str | None = None,
    file_type: GGMLQuantizationType | int | None = None,
    languages: list[str] | None = None,
    author: str | None = None,
    organization: str | None = None,
    version: str | None = None,
    license: str | None = None,
    license_name: str | None = None,
    license_link: str | None = None,
    repo_url: str | None = None,
    url: str | None = None,
    source_url: str | None = None,
    description: str | None = None,
    tags: list[str] | None = None,
) -> None:
    """Write the conventional `general.*` identity block for a converter.

    Centralises the GGUF metadata keys llama.cpp / ggml tooling expects so
    every transcribe.cpp GGUF carries a consistent, human-friendly identity
    instead of a bare slug. Keys map 1:1 onto the llama.cpp `Keys.General`
    namespace (gguf-py/gguf/constants.py), so any inspector built for
    llama.cpp or whisper.cpp reads them without surprises.

    `general.architecture` is NOT written here — the GGUFWriter constructor
    emits it automatically from its `arch` argument.

    Required (every GGUF should carry these):
      name         friendly display name, e.g. "Parakeet TDT 0.6B v3".
                   This is the headline string; set it explicitly per
                   variant rather than auto-composing from basename.
      basename     family slug, e.g. "parakeet-tdt".

    Recommended / optional (write what is known; None is skipped, leaving
    the KV absent — pass exactly what the converter already emitted so the
    existing key footprint is preserved):
      size_label   parameter-count class, e.g. "0.6B" (compute_size_label).
      file_type    reference dtype enum (int(REFERENCE_FILE_TYPE)).
      languages    BCP-47 / ISO-639 codes the model supports.
      author        creating lab/company, e.g. "NVIDIA", "OpenAI".
      organization  upstream HF org, e.g. "nvidia", "openai".
      version       model version string, e.g. "v3", "2507".
      license       SPDX expression, e.g. "apache-2.0", "cc-by-4.0".
      license_name  human-friendly license name.
      license_link  URL to the full license text.
      repo_url      canonical upstream repo (HF model page is fine).
      url           homepage / paper / release page.
      source_url    original project homepage when converted from another
                    format (provenance; e.g. an upstream GitHub repo).
      description   one-paragraph free-form description.
      tags          search/classification tags.
    """
    if not name:
        raise ValueError("general.name is required")
    if not basename:
        raise ValueError("general.basename is required")

    writer.add_string("general.name",       name)
    writer.add_string("general.basename",   basename)
    if version is not None:
        writer.add_string("general.version", version)
    if size_label is not None:
        writer.add_string("general.size_label", size_label)

    if author is not None:
        writer.add_string("general.author",       author)
    if organization is not None:
        writer.add_string("general.organization", organization)

    if license is not None:
        writer.add_string("general.license",      license)
    if license_name is not None:
        writer.add_string("general.license.name", license_name)
    if license_link is not None:
        writer.add_string("general.license.link", license_link)

    if repo_url is not None:
        writer.add_string("general.repo_url",    repo_url)
    if url is not None:
        writer.add_string("general.url",         url)
    if source_url is not None:
        writer.add_string("general.source.url",  source_url)
    if description is not None:
        writer.add_string("general.description", description)

    if file_type is not None:
        writer.add_uint32("general.file_type", int(file_type))
    if languages is not None:
        writer.add_array("general.languages",  languages)
    if tags is not None:
        writer.add_array("general.tags",   tags)


# llama.cpp / whisper.cpp tokenizer.ggml.token_type values. We follow
# the same conventions so an inspector built for either project can
# read our GGUFs without surprises.
TOKEN_TYPE_NORMAL  = 1
TOKEN_TYPE_UNKNOWN = 2
TOKEN_TYPE_CONTROL = 3
TOKEN_TYPE_USER    = 4
TOKEN_TYPE_UNUSED  = 5
TOKEN_TYPE_BYTE    = 6


def safe_id(method) -> int | None:
    """Wrap a SentencePieceProcessor id accessor: -1 -> None.

    SentencePiece returns -1 when a special token isn't defined. GGUF
    wants the KV absent in that case, which the writer expresses as None.
    """
    v = method()
    return v if v >= 0 else None


def reference_dtype_for(
    name: str,
    reference_type: GGMLQuantizationType,
) -> GGMLQuantizationType:
    """Pick the per-tensor GGUF dtype for a converter emitting a
    reference-tier GGUF. Mirrors the bucketing in
    tools/transcribe-quantize/policy.cpp::classify_tensor so the
    produced file matches the loader's allowlist in
    src/transcribe-weights-util.h (TRANSCRIBE_QUANT_{LINEAR,CONV}_TYPES
    and the F32-only slots used by GET_F32).

    Policy:
      - Norm / bias / BN stats / pos biases / frontend buffers → F32
      - Conv kernels (2D, depthwise, 1×1 pointwise)            → F16 if
        reference is BF16 (loader rejects BF16 conv); otherwise the
        reference dtype
      - Linear / Embed (everything else)                       → reference

    Keep this in sync with tools/transcribe-quantize/policy.cpp.
    """
    # Norm bucket.
    if name.endswith(".bias"):
        return GGMLQuantizationType.F32
    if ".bn." in name:
        return GGMLQuantizationType.F32
    if "norm_" in name and name.endswith(".weight"):
        return GGMLQuantizationType.F32
    if name.endswith(".final_norm.weight") or \
       name.endswith(".embed.norm.weight"):
        return GGMLQuantizationType.F32
    # Qwen3-style norm weights that don't match the "norm_" prefix rule
    # (per-head q_norm/k_norm on attention, output RMSNorm before the
    # tied head, pre/post encoder layer norms).
    if name.endswith(".q_norm.weight") or name.endswith(".k_norm.weight"):
        return GGMLQuantizationType.F32
    if name.endswith(".output_norm.weight"):
        return GGMLQuantizationType.F32
    if name.endswith(".ln_post.weight") or name.endswith(".ln_pre.weight"):
        return GGMLQuantizationType.F32
    if name.endswith(".pos_bias_u") or name.endswith(".pos_bias_v"):
        return GGMLQuantizationType.F32
    if name.endswith(".pos_enc"):
        return GGMLQuantizationType.F32
    if name.endswith(".pos_emb.weight"):
        return GGMLQuantizationType.F32
    if name in ("frontend.mel_filterbank", "frontend.window"):
        return GGMLQuantizationType.F32

    # Conv bucket (pointwise + depthwise + 2D).
    is_convpw = (
        (name.endswith(".conv.pointwise1.weight") or
         name.endswith(".conv.pointwise2.weight"))
        and "enc.blocks." in name
    )
    is_conv = ".conv." in name and name.endswith(".weight")
    if is_convpw or is_conv:
        if reference_type == GGMLQuantizationType.BF16:
            return GGMLQuantizationType.F16  # loader has no BF16 conv kernel
        return reference_type

    # Linear / Embed — use the reference dtype as-is.
    return reference_type


def encode_for_gguf(
    arr: np.ndarray,
    ggml_type: GGMLQuantizationType,
) -> tuple[np.ndarray, GGMLQuantizationType]:
    """Pack an fp32 array into GGUF bytes at F32, F16, or BF16.

    This is the only dtype encoding Python is permitted to do. Block
    quantization (Q8_0, Q4_K_M, ...) goes through
    tools/transcribe-quantize/ — see docs/tools/quantization.md.
    """
    if arr.dtype != np.float32:
        raise TypeError(
            f"encode_for_gguf expects fp32 input, got {arr.dtype}"
        )
    if ggml_type == GGMLQuantizationType.F32:
        return arr, GGMLQuantizationType.F32
    if ggml_type == GGMLQuantizationType.F16:
        return arr.astype(np.float16), GGMLQuantizationType.F16
    if ggml_type == GGMLQuantizationType.BF16:
        packed = gguf.quants.quantize(arr, GGMLQuantizationType.BF16)
        return packed, GGMLQuantizationType.BF16
    raise ValueError(
        f"encode_for_gguf only accepts F32/F16/BF16; got {ggml_type!r}. "
        "Block-quantized types go through tools/transcribe-quantize."
    )


# Canonical schema enum values for stt.frontend.normalize, matching
# docs/porting/families/_intake-schema.json. Reference-framework cfgs
# write idiosyncratic strings for these (NeMo: "NA" for "no
# normalization", "per_feature", "all_features"; some frameworks use
# null). canonicalize_normalize maps to our schema so the GGUF and the
# intake declarations agree, and the C++ loader only branches on the
# canonical set.
_NORMALIZE_ALIASES = {
    None:               "none",
    "":                 "none",
    "NA":               "none",   # NeMo "anything-else" / no-op sentinel
    "none":             "none",
    "None":             "none",
    "per_feature":      "per_feature",
    "all_features":     "global",
    "global":           "global",
    "per_utterance":    "per_utterance",
}


def canonicalize_normalize(raw) -> str:
    """Map a reference-framework normalize value to the canonical enum
    in our intake schema (per_feature / global / per_utterance / none).
    Unknown values raise — Stage 3 should fail loudly rather than emit
    a value the C++ loader will not recognise."""
    key = raw if raw is None else str(raw)
    if key in _NORMALIZE_ALIASES:
        return _NORMALIZE_ALIASES[key]
    raise ValueError(
        f"unrecognised frontend normalize value {raw!r}; "
        f"add an alias entry in scripts/lib/gguf_common.py "
        f"or update the intake schema enum."
    )


# Large array / blob KVs, in canonical trailer order. These are relocated to the
# end of the KV section so range-read consumers can fetch the small scalar
# metadata (general.*, stt.*, tokenizer identity) without pulling the multi-MB
# tokenizer tables. GGUF has no KV offset index — readers parse KVs sequentially
# — so anything a remote consumer wants cheaply must precede these.
BULK_KV_KEYS = (
    "tokenizer.ggml.tokens",
    "tokenizer.ggml.scores",
    "tokenizer.ggml.token_type",
    "tokenizer.ggml.merges",
    "tokenizer.chat_template",
)


def move_bulk_metadata_last(writer) -> list[str]:
    """Move the large tokenizer KVs to the end of every split's KV section.

    The internal mechanism behind `gguf_writer()` — converters should build
    their writer via that factory rather than calling this directly, so the
    streaming-friendly layout is automatic and cannot be forgotten. Keeps the
    small, range-read-friendly scalar metadata first regardless of the order the
    converter emitted KVs in. Returns the keys actually moved (for logging and
    tests); a no-op when none of the bulk keys are present.
    """
    kv_data = getattr(writer, "kv_data", None)
    if not isinstance(kv_data, list) or not all(isinstance(s, dict) for s in kv_data):
        raise RuntimeError(
            "move_bulk_metadata_last: writer.kv_data is not the expected "
            "list[dict] (gguf API drift?); refusing to reorder silently."
        )
    moved: list[str] = []
    for shard in kv_data:
        for key in BULK_KV_KEYS:
            if key in shard:
                shard[key] = shard.pop(key)  # dict preserves insertion order
                if key not in moved:
                    moved.append(key)
    return moved


class _BulkLastGGUFWriter(gguf.GGUFWriter):
    """GGUFWriter that relocates the bulk tokenizer KVs to the trailer at write
    time. Hooked at write_kv_data_to_file (not write_header_to_file): the header
    pass calls add_shard_kv_data(), which appends split.* scalar KVs, so we must
    reorder *after* those are present but immediately before the KV dict is
    serialized. The header only writes the KV count, which reordering leaves
    unchanged."""

    def write_kv_data_to_file(self) -> None:
        move_bulk_metadata_last(self)
        super().write_kv_data_to_file()


def gguf_writer(path, arch: str, **kwargs) -> gguf.GGUFWriter:
    """Construct a GGUFWriter that automatically emits the bulk tokenizer KVs
    (tokens / scores / token_type / merges / chat_template) in a trailer after
    all scalar metadata, so remote consumers can range-read the small metadata
    prefix without pulling the multi-MB tokenizer tables. Converters MUST build
    their writer through this factory instead of gguf.GGUFWriter directly — that
    is the single place the streaming layout is enforced."""
    return _BulkLastGGUFWriter(path, arch, **kwargs)
