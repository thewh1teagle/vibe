#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["gguf>=0.1.0", "numpy~=1.26.4"]
# ///
"""Dump the KV metadata and tensor inventory of a GGUF file.

Usage:
    uv run dump_gguf.py <file.gguf>            # KV + tensors
    uv run dump_gguf.py <a.gguf> <b.gguf>      # also diff names/shapes/KV
"""
from __future__ import annotations

import sys

from gguf import GGUFReader


def dump(path: str) -> tuple[dict, list]:
    r = GGUFReader(path)
    kv = {}
    for k, f in r.fields.items():
        v = f.contents()
        if isinstance(v, (bytes, bytearray)):
            v = v.decode()
        kv[k] = v
    tensors = [(t.name, tuple(int(x) for x in t.shape), t.tensor_type.name) for t in r.tensors]
    return kv, tensors


def main() -> int:
    kv, tensors = dump(sys.argv[1])
    print("### KV")
    for k, v in kv.items():
        print(f"{k}\t{v!r}")
    print(f"### TENSORS ({len(tensors)})")
    for name, shape, dtype in tensors:
        print(f"{name}\t{list(shape)}\t{dtype}")

    if len(sys.argv) > 2:
        kv2, tensors2 = dump(sys.argv[2])
        print("### DIFF")
        for k in sorted(set(kv) | set(kv2)):
            if kv.get(k) != kv2.get(k):
                print(f"KV {k}: {kv.get(k)!r} != {kv2.get(k)!r}")
        a = {n: s for n, s, _ in tensors}
        b = {n: s for n, s, _ in tensors2}
        for n in sorted(set(a) | set(b)):
            if a.get(n) != b.get(n):
                print(f"TENSOR {n}: {a.get(n)} != {b.get(n)}")
        print("tensor names+shapes identical" if a == b else "TENSOR MISMATCH")
    return 0


if __name__ == "__main__":
    sys.exit(main())
