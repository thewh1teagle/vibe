# Sortformer GGUF conversion

How `models/diar_streaming_sortformer_4spk-v2.f32.gguf` was produced, and what is inside it.

The GGUF is built **from the original NeMo checkpoint**, not from any ONNX export. The full
tensor inventory lives in [`tensors.md`](./tensors.md) — that file is the spec the Rust ggml
implementation codes against.

## Artifacts

| file | size (bytes) | sha256 |
|---|---|---|
| `models/diar_streaming_sortformer_4spk-v2.nemo` | 471367680 | `b371afce2c4958186469df33d939936b9746c89f38b10a69cfd2c61254e83329` |
| `models/diar_streaming_sortformer_4spk-v2.q8_0.gguf` (NVIDIA's, cross-check) | 147075776 | `0679cfeb1ce356d0dea9470b31274f4bfc7eb927497d82005483770666da998a` |
| `models/diar_streaming_sortformer_4spk-v2.f32.gguf` (built here) | 491094752 | `b867938b440b2a65f24ee511392fdac69bdcdb07c93390945ca4bdd86837a2e0` |

Source model: <https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2> (CC-BY-4.0, not gated).
Converter: <https://github.com/NVIDIA/NeMo-Speech.cpp> (Apache-2.0), commit
`4f9676226f667d14608487df744f375db87127f8` (2026-08-19).

The sha256 values above were all computed from the files actually sitting in `models/`.

There is a second, unrelated Sortformer converter in this tree at
`plans/transcribe.cpp/scripts/convert-sortformer.py`. It targets **v2.1** and uses a completely
different naming scheme (`diar.encoder_proj.*`, `diar.fc1.*`, `diar.spk_head.*`, KV under
`stt.sortformer.*`). It is not what this GGUF uses. NVIDIA's naming is preferred here precisely
because NVIDIA ships a GGUF we can diff against.

## Reproduce

The converter was run **unmodified** — no adaptation was needed. NeMo itself is not required
(and does not install on Apple Silicon); only `torch`, `numpy`, `PyYAML` and `gguf` are.

```sh
# 1. checkpoint + NVIDIA's official GGUF (the cross-check)
cd models
curl -L -O https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2/resolve/main/diar_streaming_sortformer_4spk-v2.nemo
curl -L -O https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2/resolve/main/diar_streaming_sortformer_4spk-v2.q8_0.gguf
shasum -a 256 diar_streaming_sortformer_4spk-v2.nemo   # must match the table above

# 2. NVIDIA's converter
git clone --depth 1 https://github.com/NVIDIA/NeMo-Speech.cpp.git /tmp/NeMo-Speech.cpp

# 3. isolated interpreter (never the system python)
uv venv --python 3.11 /tmp/sortformer-venv
VIRTUAL_ENV=/tmp/sortformer-venv uv pip install \
    "torch~=2.6.0" "numpy~=1.26.4" "PyYAML>=6,<7" "gguf>=0.1.0"

# 4. convert to F32 (reference dtype, for bit-tight parity work)
cd /tmp/NeMo-Speech.cpp
/tmp/sortformer-venv/bin/python convert_model.py \
    <repo>/models/diar_streaming_sortformer_4spk-v2.nemo \
    --architecture diarization --outtype f32 \
    -o <repo>/models/diar_streaming_sortformer_4spk-v2.f32.gguf
```

Expected converter output:

```
[convert] weight_type = f32 (linear=F32)
[convert] state_dict has 990 tensors
[convert] encoder d_model=512 n_layers=17 n_heads=8 d_ff=2048 feat_in=128; transformer n_layers=18 hidden=192; num_speakers=4
[convert] preprocessor.fb from checkpoint, shape (128, 257)
[convert] emitted 969 tensors, skipped 21
[convert] dtype tally: F16=22, F32=947
```

969 emitted + `encoder.pos_enc.pe` + `preprocessor.fb` = **971 tensors** in the file.

### Inspect and diff

```sh
uv run crates/diarize-rs/scripts/dump_gguf.py \
    models/diar_streaming_sortformer_4spk-v2.f32.gguf \
    models/diar_streaming_sortformer_4spk-v2.q8_0.gguf
```

With two arguments it prints a `### DIFF` section listing every KV and every tensor
name/shape that differs. For this pair the only differences are `general.name` and
`general.file_type`; **tensor names and shapes are identical** — see "Cross-check" below.

## Architecture, read back from the GGUF

All values below were read out of `diar_streaming_sortformer_4spk-v2.f32.gguf`, and every
one of them is byte-identical in NVIDIA's published q8_0.

### Fast-Conformer (NEST) encoder

| dim | value |
|---|---|
| `n_layers` | 17 |
| `d_model` | 512 |
| `n_heads` | 8 (`d_head` = 64) |
| `d_ff` | 2048 (`ff_expansion_factor` 4) |
| `conv_kernel_size` | 9 |
| subsampling | `dw_striding`, factor **8**, 256 conv channels |
| `feat_in` | 128 mel bands |
| positional encoding | `rel_pos`, `pos_emb_max_len` 5000 -> 9999-row table |

### Transformer stack

| dim | value |
|---|---|
| `n_layers` | 18 |
| `hidden_size` | 192 |
| `inner_size` | 768 |
| `n_heads` | 8 (`d_head` = 24) |
| `pre_ln` | **false** (post-LN; no final LN tensor) |
| activation | ReLU |

### Head

`num_speakers` = **4**.

### Mel filterbank

**Yes — the trained filterbank ships as a tensor**, named **`preprocessor.fb`**, `ne = [257, 128]`
(128 mel bands x 257 rFFT bins), F32 in both builds. It is copied verbatim from the checkpoint's
`preprocessor.featurizer.fb` (torch `(1, 128, 257)`, squeezed). Do not rebuild it from librosa —
use the tensor. The Hann analysis window is *not* shipped; build `hann(400, periodic=True)`.

## Complete GGUF KV metadata (45 keys)

| key | type | value in this checkpoint |
|---|---|---|
| `general.architecture` | STRING | `sortformer` |
| `general.name` | STRING | `diar_streaming_sortformer_4spk-v2.f32` (NVIDIA's file says `sortformer-v2-q8_0`) |
| `general.file_type` | UINT32 | `0` (all-F32; NVIDIA's file says `7`) |
| `sortformer.encoder.d_model` | UINT32 | `512` |
| `sortformer.encoder.n_layers` | UINT32 | `17` |
| `sortformer.encoder.n_heads` | UINT32 | `8` |
| `sortformer.encoder.d_ff` | UINT32 | `2048` |
| `sortformer.encoder.conv_kernel_size` | UINT32 | `9` |
| `sortformer.encoder.subsampling_factor` | UINT32 | `8` |
| `sortformer.encoder.subsampling_conv_channels` | UINT32 | `256` |
| `sortformer.encoder.feat_in` | UINT32 | `128` |
| `sortformer.encoder.xscaling` | BOOL | `true` (scale pre-encode output by `sqrt(d_model)`) |
| `sortformer.encoder.use_bias` | BOOL | `true` |
| `sortformer.encoder.pos_emb_max_len` | UINT32 | `5000` |
| `sortformer.encoder.conv_norm` | STRING | `batch_norm` |
| `sortformer.encoder.conv_context` | STRING | `symmetric` |
| `sortformer.encoder.att_context_style` | STRING | `regular` |
| `sortformer.transformer.n_layers` | UINT32 | `18` |
| `sortformer.transformer.hidden_size` | UINT32 | `192` |
| `sortformer.transformer.inner_size` | UINT32 | `768` |
| `sortformer.transformer.n_heads` | UINT32 | `8` |
| `sortformer.transformer.pre_ln` | BOOL | `false` |
| `sortformer.num_speakers` | UINT32 | `4` |
| `sortformer.preprocessor.sample_rate` | UINT32 | `16000` |
| `sortformer.preprocessor.window_size` | FLOAT32 | `0.025` (= 400 samples) |
| `sortformer.preprocessor.window_stride` | FLOAT32 | `0.01` (= 160 samples) |
| `sortformer.preprocessor.n_fft` | UINT32 | `512` |
| `sortformer.preprocessor.features` | UINT32 | `128` |
| `sortformer.preprocessor.normalize` | STRING | `NA` (**no** per-feature mean/var normalization) |
| `sortformer.preprocessor.preemph` | FLOAT32 | `0.97` |
| `sortformer.preprocessor.dither` | FLOAT32 | `1e-05` (set to 0 for deterministic inference) |
| `sortformer.preprocessor.log_zero_guard` | FLOAT32 | `5.9604645e-08` (= 2^-24, added before `log`) |
| `sortformer.scoring.spkcache_sil_frames_per_spk` | UINT32 | `3` |
| `sortformer.scoring.pred_score_threshold` | FLOAT32 | `0.25` |
| `sortformer.scoring.scores_boost_latest` | FLOAT32 | `0.05` |
| `sortformer.scoring.sil_threshold` | FLOAT32 | `0.2` |
| `sortformer.scoring.strong_boost_rate` | FLOAT32 | `0.75` |
| `sortformer.scoring.weak_boost_rate` | FLOAT32 | `1.5` |
| `sortformer.scoring.min_pos_scores_rate` | FLOAT32 | `0.5` |
| `sortformer.streaming.spkcache_len` | UINT32 | `188` |
| `sortformer.streaming.fifo_len` | UINT32 | `0` |
| `sortformer.streaming.chunk_len` | UINT32 | `188` |
| `sortformer.streaming.spkcache_update_period` | UINT32 | `188` |
| `sortformer.streaming.chunk_left_context` | UINT32 | `1` |
| `sortformer.streaming.chunk_right_context` | UINT32 | `1` |

Plus the three GGUF container fields: `GGUF.version` = 3, `GGUF.tensor_count` = 971,
`GGUF.kv_count` = 45.

Caveats on provenance of a few of those values, from reading `model_config.yaml` inside the
`.nemo`:

- `preemph`, `log_zero_guard` and all seven `sortformer.scoring.*` values except
  `spkcache_sil_frames_per_spk` are **not** in the checkpoint config. The converter emits
  NeMo constructor defaults for them (`AudioToMelSpectrogramPreprocessor.preemph = 0.97`,
  `log_zero_guard_value = 2**-24`, `SortformerModules` scoring defaults).
- `sortformer.streaming.*` are the training-time geometry (188/0/188). NVIDIA's own C++
  runtime treats these as provenance only and takes its geometry from its own presets; a
  Rust implementation should do the same rather than hard-wiring 188.
- `conv_context = "symmetric"` is emitted unconditionally by the converter (the config's
  `conv_context_size` is `null`); with `conv_kernel_size = 9` that means padding 4 on each side.

## Tensor naming scheme

Names follow NVIDIA's C++ runtime, so the encoder is bit-compatible with their ASR loader.
Mapping from the `.nemo` state dict:

| checkpoint prefix | GGUF prefix |
|---|---|
| `encoder.*` | `encoder.*` (unchanged) |
| `transformer_encoder.*` | `transformer.*` |
| `sortformer_modules.encoder_proj.*` | `encoder_proj.*` |
| `sortformer_modules.first_hidden_to_hidden.*` | `head.first_hidden_to_hidden.*` |
| `sortformer_modules.single_hidden_to_spks.*` | `head.single_hidden_to_spks.*` |
| `preprocessor.featurizer.fb` | `preprocessor.fb` (squeezed to 2-D) |
| — (synthesized) | `encoder.pos_enc.pe` |

Dropped: `preprocessor.featurizer.window`, all 17 `…batch_norm.num_batches_tracked`,
`sortformer_modules.hidden_to_spks.{weight,bias}` (unused at inference), and anything under
`spec_augmentation.` / `loss.`.

Two shape rewrites the converter performs, which the Rust side sees as already done:

- `conv.pointwise_conv{1,2}.weight` loses its trailing kernel dim (`(out, in, 1)` -> `(out, in)`)
  and is therefore a plain matrix, not a conv tensor.
- `preprocessor.featurizer.fb` loses its leading batch dim.

Everything else keeps its torch shape, which GGUF stores reversed — see the note at the top
of `tensors.md`.

## Cross-check against NVIDIA's published GGUF

Diffing this F32 build against `diar_streaming_sortformer_4spk-v2.q8_0.gguf` (pushed by NVIDIA
to the same HF repo):

- **Tensor count: 971 in both.**
- **Tensor names: identical sets, no additions, no removals.**
- **Tensor shapes: identical for all 971.**
- KV: identical for all 45 keys except `general.name` and `general.file_type`, which are
  cosmetic (the converter derives `general.name` from the output filename because the
  checkpoint config has no `name` field).
- Dtypes: 22 F16 tensors in both (the conv kernels). The remaining 949 are F32 here;
  in NVIDIA's file 297 of them (the linear weights) are Q8_0 and 652 stay F32.

Numeric agreement, dequantizing both sides:

- 673 of 971 tensors are **bit-identical**.
- The 297 Q8_0 tensors agree to a max relative error of **4.15e-3**, which is just Q8_0
  block-quantization error — expected, not drift.
- One non-quantized tensor differs: `encoder.pos_enc.pe`, max absolute delta **4.88e-4**.
  That is exactly fp16 spacing near 1.0, i.e. NVIDIA's shipped PE table was round-tripped
  through fp16 at some point. Both are valid samplings of the same analytic
  `sin`/`cos` formula; a Rust implementation should generate the table in F32.

No naming or shape drift was found. If a future converter commit produces a diff in the
`### DIFF` section beyond `general.name` / `general.file_type`, treat it as a regression.
