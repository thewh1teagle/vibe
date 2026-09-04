# Sortformer on GGML in Rust — gap analysis and port notes

What has to be written to run NVIDIA Streaming Sortformer v2.1 through GGML in
Rust, given the working FastConformer in `crates/parakeet-rs` and the finished
C++ port in `plans/transcribe.cpp/src/arch/sortformer/`.

Everything below was checked against those two sources; where my reading and
the C++ disagreed, the C++ wins and the disagreement is called out.

---

## 0. The headline question: is parakeet-rs's FastConformer the variant Sortformer needs?

**Topologically yes, numerically no — because of biases.**

The NEST encoder in Sortformer is the same NeMo `ConformerEncoder` class
Parakeet uses, configured the same way in every knob that changes the graph
shape, and configured *differently* in exactly one knob that changes the graph
contents.

| knob | Sortformer (C++ `fill_conformer_hp`, model.cpp:88-115) | parakeet-rs | same? |
|---|---|---|---|
| conv norm type | `BatchNorm` (model.cpp:106) | BatchNorm, graph-time (ops.rs:221-223) | **yes** |
| pre_encode padding | symmetric `(k-1)/2`, `causal_pre_encode = false` (model.cpp:sf_conv_policy) | symmetric (encoder.rs:5 `symmetric_pad`) | **yes** |
| depthwise conv padding | centred `(k-1)/2` (`conv_context_left/right = -1`, model.cpp:490-491) | centred (ops.rs:212) | **yes** |
| attention masking | full, `att_context_left/right = -1`, `Regular` style (model.cpp:487-489) | full (a zero mask tensor, encoder.rs:180 `full_mask`) | **yes** |
| xscaling | `true` (model.cpp:99) | `true` for this GGUF, gated on a KV (encoder.rs:143, load.rs:312) | **yes** |
| untied pos biases | `pos_bias_u` / `pos_bias_v` added pre-permute (conformer.cpp:598-600) | same (ops.rs:127-128) | **yes** |
| rel-pos attention scale | `1/sqrt(head_dim)`, pre-applied to `matrix_bd`, passed to flash (conformer.cpp:535, 706, 725) | identical (ops.rs:121, 153, 158) | **yes** |
| macaron half-scale | `0.5` (conformer.cpp:76) | `0.5` (ops.rs:43) | **yes** |
| subsampling | dw_striding, factor 8, 256 ch | same stem (encoder.rs:37-65) | **yes** |
| **`use_bias`** | **`true`** — model.cpp:97 `p.enc_use_bias = true`, and `load_conformer_weights` (model.cpp:359-372) *requires* 11 bias tensors per block | **the Rust graph has no bias parameters at all** | **NO** |

That last row is the whole answer. `crates/parakeet-rs/src/load.rs:182-198`
validates the bias tensors when `encoder_uses_bias` is set, but
`encoder.rs:67-133` then builds the block passing `null` for the FF biases and
never passes q/k/v/out/pointwise/depthwise biases at all — `ops.rs:103-161`
(`attention`) and `ops.rs:164-226` (`conv_module`) have no bias arguments in
their signatures. For Parakeet's own GGUF (`encoder_uses_bias == false`) that
is correct. Run a `use_bias=true` encoder like Sortformer's through it and you
silently drop **11 bias adds per block × 17 blocks**: the output looks like a
plausible activation and is wrong. This is the single most expensive thing to
get wrong here, and it is invisible without a reference dump.

Consequence for the plan: the conformer stack could not simply be called; it
had to be re-emitted with biases threaded through. That is `sf_ops.rs` in this
directory. It is a faithful copy of parakeet-rs's ops (same layouts, same
`rel_shift`, same im2col depthwise, same sigmoid workaround) plus the bias adds
at the eleven sites the C++ `BlockView` marks nullable.

Two further differences, neither of which changes results:

* **BatchNorm fusion timing.** The C++ folds BN into `scale`/`bias` once at
  load, after the tensors are uploaded (`fuse_conformer_bn_core`,
  model.cpp:216-258). parakeet-rs recomputes `gamma/sqrt(var+eps)` with graph
  ops every build (ops.rs:221-223). Same epsilon (1e-5), same arithmetic, same
  result — but Sortformer rebuilds the 17-block graph *per streaming chunk*, so
  paying for it once is worth it. Implemented at load in
  `sf_weights.rs::fuse_batch_norm`.
* **K/V dtype.** parakeet-rs casts K and V to F16 before flash attention
  (ops.rs:156-157). The C++ pins `kv_type = GGML_TYPE_F32` for the Sortformer
  stream graph (model.cpp:481). Followed the C++.

---

## 1. Per-stage gap table

`P` = `crates/parakeet-rs/src/`, `C` = `plans/transcribe.cpp/src/`.

| stage | in parakeet-rs? | status | new code |
|---|---|---|---|
| mel frontend | `P/mel.rs` exists but is `normalize="per_feature"` (mel.rs:136); Sortformer is `normalize="none"` with `log(x + 2^-24)` and preemph 0.97 | **do not reuse** — the Sortformer host DSP was vendored instead, and now takes its filterbank from the GGUF | `host/mel.rs` |
| pre_encode stem | `P/encoder.rs:37` `build_pre_encode`, already exposed standalone via `P/model.rs:219` `encode_stem` | **adapt** (needs its own weight view, and must be its own graph) | `sf_graph.rs::build_pre_encode` |
| xscale | `P/encoder.rs:143` | **adapt** — must move to the concat, not the chunk (see §2) | `sf_graph.rs::build_infer_graph` |
| rel-pos table | `P/encoder.rs:165` `positional_embedding` — correct formula, but `pub(crate)` | **duplicate** (visibility) | `sf_transformer.rs::rel_pos_table` |
| conformer block | `P/encoder.rs:67` + `P/ops.rs` | **rewrite with biases** (see §0) | `sf_ops.rs::conformer_block` and friends |
| BN fusion at load | absent (done in-graph) | **missing** | `sf_weights.rs::fuse_batch_norm` |
| `encoder_proj` 512→192 | absent | **missing** | `sf_transformer.rs::encoder_proj` |
| post-LN transformer block | absent (Parakeet has no transformer; its post-encoder path is a TDT decoder, `P/decoder.rs`) | **missing** | `sf_transformer.rs::transformer_block` |
| diar sigmoid head | absent | **missing** | `sf_transformer.rs::diar_head` |
| two-graph streaming split | absent (`P/model.rs:242` `encode` is one graph mel→encoder out) | **missing** | `sf_graph.rs::run_chunk` |
| GGUF load / catalog | `P/load.rs` — right shape, wrong catalog and wrong KV namespace | **adapt** | `sf_weights.rs` |
| graph runtime | `P/runtime.rs` — usable as-is but `pub(crate)` | **duplicate** (visibility) | `sf_runtime.rs` |
| AOSC / FIFO state machine | — | **vendored** out of the ONNX crate so it could be dropped | `host/aosc.rs`, `host/mel.rs`, `host/segment.rs`, `host/config.rs` |
| the seam between the two | — | **new** | `host/backend.rs` (the trait), `sf_backend.rs` (the ggml impl) |

## 2. The numerics that bite

Each of these is reproduced in the new code and each has a comment pointing at
its C++ line.

1. **The post-LN transformer's attention scale.** NeMo's `MultiHeadAttention`
   divides **q and k each** by `head_dim ** 0.25`, then does the score matmul
   with no further scaling (C++ `model.cpp:286-287`, and the comment at
   `model.cpp:298`). Overall that is the usual `1/sqrt(d_k)`, but a single
   post-matmul `ggml_scale` is not the same computation and drifts once
   anything is not f32. `sf_transformer.rs` pre-divides both.
   *(The conformer's rel-pos attention is different and uses the plain
   `1/sqrt(head_dim)` on the score matrix — do not "unify" the two.)*
2. **xscale applies to the concat, not the chunk.** `model.cpp:475` scales
   `concat_in`, i.e. `[spkcache | fifo | chunk]`, by `sqrt(512)` at the top of
   Graph B. The AOSC cache therefore stores **raw, unscaled** pre-encode output.
   Scaling inside Graph A would multiply cached frames by `sqrt(512)` again on
   every subsequent chunk — a slowly compounding error that still produces
   sane-looking probabilities.
3. **The rel-pos table is per-call over the concat.** Length
   `2 * T_concat - 1`, centred at `(len-1)/2`, position of row `i` is
   `zero - i` (`model.cpp:412-430`). `T_concat` changes as the cache fills, so
   it is rebuilt every chunk, not cached.
4. **BatchNorm is fused after upload**, not before: the fusion reads the
   tensor data through whatever buffer holds it (`model.cpp:216-218` says so
   explicitly). `sf_weights.rs` runs it as the last step of `load`, and reads
   through `ggml_backend_tensor_get` or the raw pointer depending on whether a
   GPU buffer exists.
5. **Attention over the concat is unrestricted.** No sliding window, no
   chunk mask, no key-padding mask (`model.cpp:487-489`). The cache *is* the
   context limit.
6. **No final LayerNorm after the transformer stack.** `pre_ln = false` means
   NeMo never allocates `final_layer_norm`; the C++ goes straight from the last
   block into the head (`model.cpp:503-508`). The loader rejects
   `pre_ln = true` rather than guessing (`weights.cpp:114`).
7. **Head order** is `relu → fc1 → relu → single_spk_head → sigmoid`
   (`model.cpp:507-512`). The `relu` *before* `fc1` is easy to miss; it is
   NeMo's `forward_speaker_sigmoids`. The encoder-mask multiply NeMo applies
   first is a no-op in sync streaming and is dropped, as in the C++.
8. **`diar.spk_head` is not the offline head.** The 2*hidden `spk_head` is
   loaded (shape-checked) but unused; the offline/sync path uses
   `diar.single_spk_head` (`weights.h:99-105`).

## 3. Files added

| file | contents |
|---|---|
| `sf_ops.rs` | bias-carrying ports of parakeet-rs's primitives: `layer_norm`, `linear`, `sigmoid`, `feed_forward`, `macaron`, `rel_shift`, `add_conv_bias`, `conv_2d_depthwise`, `rel_pos_attention` (flash + manual paths), `conv_module` (fused BN), `conformer_block` |
| `sf_transformer.rs` | `encoder_proj`, `transformer_block` (post-LN), `diar_head`, `rel_pos_table` (+ a unit test that the table is centred) |
| `sf_weights.rs` | `SortformerHParams` KV reader, tensor catalog with shape checks, GPU upload, load-time BN fusion, `SfError` |
| `sf_runtime.rs` | `Graph` + `Runtime`, ported from `P/runtime.rs` |
| `sf_graph.rs` | Graph A (`build_pre_encode_graph`), Graph B (`build_infer_graph`), and `run_chunk` / `run_chunk_valid` which run both and return the two tensors the host state machine consumes |
| `host/` | the vendored non-neural half: `mel.rs` (frontend), `aosc.rs` (chunking + speaker cache), `segment.rs` (median filter, hysteresis), `config.rs` (presets), `backend.rs` (the trait the graph plugs into) |
| `sf_backend.rs` | `GgmlBackend`: `host::Backend` implemented over `SortformerWeights` + `run_chunk_valid` |
| `examples/e2e_baseline.rs` | the end-to-end comparison against `baseline/` described in §4 |

The graph's own surface is `SortformerWeights::load(path)` and
`run_chunk(&weights, mel, mel_frames, cache) -> ChunkOutput` (plus
`run_chunk_valid`, which additionally takes the unpadded frame count — see §4),
where `ChunkOutput` carries exactly NeMo's `chunk_pre_encode_embs` and
`spkcache_fifo_chunk_preds`. That was deliberately the same boundary the ONNX
session had, so the AOSC state machine could be repointed with no changes to its
logic — which is what `sf_backend.rs` does, in about forty lines whose only real
job is concatenating `[spkcache | fifo]` in that order.

The crate's *public* surface is unchanged from the ONNX version: `Diarizer::new`,
`Diarizer::diarize(samples, sample_rate, channels) -> Vec<Segment>`, and
`Segment { start: f64 seconds, end: f64, speaker_id: usize }` with its serde
derives. `crates/sona` re-exports `Segment` into its HTTP wire format, so those
names and units are load-bearing.

Nothing could be reused from `crates/parakeet-rs` by *calling* it: its `ops`,
`encoder`, `runtime` and `model::tensor` are all `pub(crate)`, and the crate
that used to be a dependency here was a different, ONNX-based crate with the
same name. Hence the duplication of `runtime.rs` and `positional_embedding`. If
the two crates are merged later, `sf_runtime.rs` and `rel_pos_table` should be
deleted in favour of the originals, and `sf_ops.rs` should replace
`parakeet-rs/src/ops.rs` (it is a strict superset once the bias arguments are
allowed to be null).

## 4. Validation status

**End to end, from audio, both clips, both backends: agreement.** The example
`examples/e2e_baseline.rs` runs `testdata/6_speakers.wav` and
`plans/transcribe.cpp/samples/sortformer-2spk-mix.wav` through the whole path —
WAV -> mel -> chunking -> ggml -> AOSC cache -> post-processing — and diffs the
`[T, 4]` probability matrix against `baseline/probs/` and the segments against
`baseline/segments/`:

```
cargo run -p diarize-rs --release --example e2e_baseline -- \
    models/diar_streaming_sortformer_4spk-v2.f32.gguf
```

Measured 2026-08-24 (Metal; `DIARIZE_CPU=1` numbers in brackets):

| clip | frames | max abs | mean abs | p95 | p99 | agree @0.5 | segments |
|---|---|---|---|---|---|---|---|
| `sortformer-2spk-mix` | 151 | 1.8e-3 [3.0e-3] | 4.8e-5 [5.9e-5] | 2.4e-4 | 1.0e-3 | **100.000%** | 4/4 identical to the millisecond |
| `6_speakers` | 510 | 3.0e-3 [2.1e-3] | 3.5e-5 [3.7e-5] | 1.9e-4 | 8.8e-4 | **100.000%** | 10/10 identical to the millisecond |

Per-chunk, the residual is flat — it does not accumulate across the streaming
state. For `6_speakers` the per-chunk max runs 1.7e-3, 1.3e-3, 1.2e-3, 3.0e-3,
1.3e-4 over chunks 0-4, with 100% binarised agreement in every one. So the AOSC
cache, the FIFO, the cache compression and its topk tie-break, the wider
rel-pos table, and the storing of *unscaled* embeddings are all behaving: a
mistake in any of them permutes speaker labels or drifts monotonically, and
neither happens.

What this now covers that the chunk-1 check did not: the audio -> mel path,
every chunk past the first, the non-empty `[spkcache | fifo | chunk]` concat,
cache overflow and compression, and the post-processing that turns
probabilities into `Segment`s.

### The one real bug this found: the padded final chunk

The last chunk of a recording is zero-padded up to the 1000-mel-frame window,
and ONNX told the graph how much of it was real via a `chunk_lengths` input
(`plans/parakeet-rs/src/sortformer.rs:560`), which NeMo turns into the encoder
pad mask. The first version of the wiring dropped that: the padded tail became
125 - `valid` garbage tokens that every real frame attended to. Cost, measured:

| clip | final-chunk max abs | final-chunk agree @0.5 |
|---|---|---|
| `sortformer-2spk-mix` (27 real rows of 125) | **0.262** | 99.07% |
| `6_speakers` (14 real rows of 125) | **0.181** | 100% |

Interior chunks were unaffected (all ~1e-3), which is what identified it as a
padding problem rather than a state-machine one.

The fix is `sf_graph::run_chunk_valid`: the pre-encode output is truncated to
`ceil(valid_mel_frames / 8)` frames before the concat is built. That is
equivalent to NeMo's mask rather than an approximation of it — the padded
positions contribute nothing to a masked attention, every other op in the stack
is pointwise, and the depthwise conv sees zeros to the right of the last valid
frame either way (its own padding). `run_chunk` is kept as the
`valid == mel_frames` case so the existing per-chunk examples are unchanged.

### The mel filterbank: the expected difference is not there

The baseline recomputed the librosa/Slaney filterbank; this path uses the
torchaudio-built one the GGUF ships as `preprocessor.fb`
(`SortformerWeights::mel_filterbank` -> `MelFrontend::from_trained_filterbank`).
That was expected to cost something. Measured, the two banks differ by **max
3.7e-9, mean 5.6e-12** over all 128x257 values — float32 rounding of the same
formula. Running the full end-to-end comparison with `MelFrontend::computed()`
substituted reproduces the table above *to every printed digit*. So the mel
contributes nothing measurable here, and the residual 1e-3 is ggml-vs-ONNX
arithmetic in the encoder, the same magnitude the chunk-1 check saw.

The GGUF tensor is still the one used: it is what the checkpoint asserts, and
the equality above is a property of this export, not a guarantee.

### Streaming geometry

`Diarizer::new` hard-codes chunk 124 / fifo 124 / spkcache 188 / right_context 1
and deliberately ignores the GGUF's `sortformer.streaming.*` KVs (188 / 0 / 188).
Those KVs are training-time provenance; the ONNX export carried the inference
geometry in `metadata_props`, which is what `baseline/` was recorded with.
`right_context = 1` is in neither file — it is a parakeet-rs host assumption,
reproduced on purpose. See the comment in `lib.rs`.

### Still not validated

* Only two clips, both < 41 s, both English, neither exceeding 5 chunks. The
  speaker cache compresses for the first time on chunk 3 and is exercised
  exactly twice; a long recording would run it dozens of times.
* The streaming `feed`/`flush` entry points on `SortformerHost` are vendored
  but unreached by `Diarizer`, and have no baseline to compare against — the
  ONNX oracle was recorded through the one-shot path only.
* Multi-channel input: `diarize` downmixes, but every recorded clip is mono.
* No CI test asserts any of this. The comparison lives in an example, because
  it needs the 492 MB model and the `baseline/` dumps, neither of which is in
  the repo.

## 4b. ONNX Runtime is gone

`parakeet-rs` (and with it `ort`, its `ndarray`, and `tokenizers`) is dropped
from `crates/diarize-rs/Cargo.toml`. `cargo tree -p diarize-rs` is now
`ndarray`, `realfft`, `serde`, `thiserror`, `whisper-cpp-sys`, plus `hound` as a
dev-dependency for the example. `ndarray` stays because the vendored host DSP in
`host/` uses it directly; it no longer arrives via `ort`.

## 5. Assumptions flagged

1. **Tensor names and KV keys** are taken from
   `plans/transcribe.cpp/scripts/convert-sortformer.py` (the tables at
   lines 57-146) and `weights.cpp:51-196`. If the GGUF the other agent produces
   uses different names, only `sf_weights.rs` changes.
2. **Linear weights are stored untransposed**: PyTorch `[out, in]` written
   row-major, i.e. ggml `ne = [in, out]`, which `ggml_mul_mat(W, x)` consumes
   directly. Verified against `convert-sortformer.py::_add` (no transpose) and
   the shape assertions in `weights.cpp:160-196`.
3. **`linear_pos` has no bias.** NeMo's `RelPositionMultiHeadAttention`
   constructs it `bias=False`; the C++ never looks one up
   (`model.cpp:339` loads only `attn.linear_pos.weight`).
4. **Mel host layout.** The ggml input is `ne = [frames, n_mels]`, i.e. the
   host buffer is **mel-major** (`mel[m * frames + f]`) — that is what the C++
   copies (`model.cpp:889-893`). The existing Rust host DSP produces
   `(B, T, D)` frame-major (`sortformer.rs:1186`), so the wiring code must
   transpose. This is a real trap when re-pointing the ONNX host.
5. **Batch is always 1.** Every graph here assumes a single utterance, as the
   C++ streaming core does.
6. **Flash attention on GPU, manual path on CPU.** `build_infer_graph` picks
   the manual `mul_mat + soft_max_ext` route when the weights stayed on the
   CPU, which is the C++'s bit-exact fallback (`conformer.cpp:729-748`). If a
   CPU/GPU mismatch shows up, force the manual path everywhere first.
7. **The transformer stack is fed `[d, T]` with no batch axis**, matching
   `tf_block`'s `ggml_reshape_2d(ctx, ctx_out, d, T)` (`model.cpp:318`).
8. **`sigmoid` is spelled out** as `1/(1+exp(-x))` rather than `ggml_sigmoid`,
   following parakeet-rs's GPU-backend workaround (ops.rs:203-209). The C++
   uses the op directly; the two are numerically identical.
