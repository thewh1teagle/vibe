# /// script
# dependencies = ["gguf>=0.10", "numpy"]
# ///
"""Quantize an F32 parakeet GGUF (vibe/transcribe.cpp layout) to Q8_0.

Same bucket policy as transcribe.cpp's transcribe-quantize Q8_0 preset: matmul weights -> Q8_0,
1x1 pointwise convs -> F16, everything else (convs, norms, biases, embedding) stays F32.
All metadata is copied; general.file_type is set to MOSTLY_Q8_0.

uv run quantize.py in-F32.gguf out-Q8_0.gguf
"""

import re
import sys

import numpy as np
from gguf import GGMLQuantizationType, GGUFReader, GGUFValueType, GGUFWriter, LlamaFileType
from gguf.quants import quantize

Q8 = re.compile(r"(pre_encode\.out|\.ff[12]\.linear[12]|\.attn\.linear_\w+|pred\.lstm\.\d+\.W[xh]|joint\.(enc|pred|out))\.?(weight)?$")
F16 = re.compile(r"\.conv\.pointwise[12]\.weight$")


def main(src, dst):
    r = GGUFReader(src)
    arch = r.fields["general.architecture"].contents()
    w = GGUFWriter(dst, arch)
    for f in r.fields.values():
        if f.name.startswith("GGUF.") or f.name in ("general.architecture", "general.file_type"):
            continue
        vtype = f.types[0]
        w.add_key_value(f.name, f.contents(), vtype, sub_type=f.types[1] if vtype == GGUFValueType.ARRAY else None)
    w.add_file_type(LlamaFileType.MOSTLY_Q8_0)

    counts = {}
    for t in r.tensors:
        data = np.asarray(t.data, dtype=np.float32)
        if Q8.search(t.name) and data.shape[-1] % 32 == 0:
            w.add_tensor(t.name, quantize(data, GGMLQuantizationType.Q8_0), raw_dtype=GGMLQuantizationType.Q8_0)
            kind = "Q8_0"
        elif F16.search(t.name):
            w.add_tensor(t.name, data.astype(np.float16))
            kind = "F16"
        else:
            w.add_tensor(t.name, data)
            kind = "F32"
        counts[kind] = counts.get(kind, 0) + 1
    w.write_header_to_file()
    w.write_kv_data_to_file()
    w.write_tensors_to_file()
    w.close()
    print(f"wrote {dst}: {counts}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
