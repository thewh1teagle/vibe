# Sortformer GGUF tensor inventory

Read back from `models/diar_streaming_sortformer_4spk-v2.f32.gguf` (built here from the
`.nemo`) and cross-checked against NVIDIA's published `models/diar_streaming_sortformer_4spk-v2.q8_0.gguf`.
Both files carry the **same 971 tensors with the same names and the same shapes**; only the
storage dtype of the 297 linear weights differs.

Shapes are printed as GGUF/ggml `ne` — **reversed** relative to the PyTorch shape.
A torch `Linear(in, out)` weight of torch-shape `(out, in)` appears here as `[in, out]`,
i.e. ggml `ne[0] = in` is the contiguous dimension. `ggml_mul_mat(W, x)` with `W` as stored
and `x` of `ne[0] = in` yields `ne[0] = out`, so no transposes are needed anywhere.

Totals: 971 tensors, 117,744,681 parameters in the source checkpoint
(990 state_dict entries, 21 skipped by the converter, 2 synthesized).

---

## 1. Preprocessor

The **trained mel filterbank is present as a tensor**. It is copied verbatim out of the
checkpoint (`preprocessor.featurizer.fb`, torch shape `(1, 128, 257)`), squeezed to
`(128, 257)` and stored as `preprocessor.fb`. Do **not** rebuild it with librosa/slaney —
use the tensor.

| tensor | shape (ggml `ne`, fastest dim first) | dtype (f32 build) | dtype (NVIDIA q8_0) |
|---|---|---|---|
| `preprocessor.fb` | `[257, 128]` | F32 | F32 |

`ne = [257, 128]` = 128 mel bands x 257 rFFT bins (`n_fft=512`). Row `m` of the torch view
is `fb[m*257 .. m*257+257]` in memory.

`preprocessor.featurizer.window` (the Hann window, torch `(400,)`) is **NOT** emitted —
build `hann(400, periodic=True)` from `window_size=0.025 * sample_rate=16000`.

## 2. Positional encoding (synthesized, not from the checkpoint)

| tensor | shape (ggml `ne`, fastest dim first) | dtype (f32 build) | dtype (NVIDIA q8_0) |
|---|---|---|---|
| `encoder.pos_enc.pe` | `[512, 9999]` | F32 | F32 |

`ne = [512, 9999]` = `2*pos_emb_max_len - 1 = 9999` positions x `d_model = 512`.
Built analytically by the converter (NeMo `RelPositionalEncoding`), positions running
`+4999 .. -4999` (i.e. `torch.arange(max_len-1, -max_len, -1)`), with
`pe[:, 0::2] = sin(pos * div)`, `pe[:, 1::2] = cos(pos * div)`,
`div = exp(arange(0, d_model, 2) * -(ln(10000)/d_model))`.
A Rust implementation may equally well generate this table at load time.

## 3. Encoder pre-encode (`dw_striding`, subsampling factor 8)

Three depthwise-separable stride-2 stages over the 128-band mel input, then a linear
projection to `d_model`. Conv weights are F16 in **both** builds (ggml's im2col path
asserts F16 kernels); biases are F32.

| tensor | shape (ggml `ne`, fastest dim first) | dtype (f32 build) | dtype (NVIDIA q8_0) |
|---|---|---|---|
| `encoder.pre_encode.out.weight` | `[4096, 512]` | F32 | Q8_0 |
| `encoder.pre_encode.out.bias` | `[512]` | F32 | F32 |
| `encoder.pre_encode.conv.0.weight` | `[3, 3, 1, 256]` | F16 | F16 |
| `encoder.pre_encode.conv.0.bias` | `[256]` | F32 | F32 |
| `encoder.pre_encode.conv.2.weight` | `[3, 3, 1, 256]` | F16 | F16 |
| `encoder.pre_encode.conv.2.bias` | `[256]` | F32 | F32 |
| `encoder.pre_encode.conv.3.weight` | `[1, 1, 256, 256]` | F16 | F16 |
| `encoder.pre_encode.conv.3.bias` | `[256]` | F32 | F32 |
| `encoder.pre_encode.conv.5.weight` | `[3, 3, 1, 256]` | F16 | F16 |
| `encoder.pre_encode.conv.5.bias` | `[256]` | F32 | F32 |
| `encoder.pre_encode.conv.6.weight` | `[1, 1, 256, 256]` | F16 | F16 |
| `encoder.pre_encode.conv.6.bias` | `[256]` | F32 | F32 |

Layout of the `conv` `nn.Sequential` (indices are the torch module indices; 1 and 4 are
the ReLU activations and carry no weights):

| idx | op | kernel `ne` | note |
|---|---|---|---|
| 0 | Conv2d 1 -> 256, k3, stride 2, pad 1 | `[3, 3, 1, 256]` | standard conv |
| 1 | ReLU | - | |
| 2 | Conv2d 256 depthwise, k3, stride 2, pad 1 | `[3, 3, 1, 256]` | `groups=256` |
| 3 | Conv2d 256 -> 256, k1 (pointwise) | `[1, 1, 256, 256]` | |
| 4 | ReLU | - | |
| 5 | Conv2d 256 depthwise, k3, stride 2, pad 1 | `[3, 3, 1, 256]` | `groups=256` |
| 6 | Conv2d 256 -> 256, k1 (pointwise) | `[1, 1, 256, 256]` | |
| (7) | ReLU | - | |

`out` is `Linear(4096, 512)`: 128 mels / 8 = 16 surviving frequency bins x 256 channels
= 4096. Frames are subsampled 8x (10 ms hop -> 80 ms per encoder frame).

## 4. Conformer blocks — `encoder.layers.{0..16}` (17 layers, d_model 512)

All 17 layers carry an **identical** set of 39 tensors (663 total). Block order in the
state dict is FF1 -> conv -> self-attn -> FF2 -> out-norm; the NeMo `ConformerLayer`
forward is macaron: `x += 0.5*FF1(norm_ff1(x))`, `x += conv(norm_conv(x))`,
`x += attn(norm_self_att(x))`, `x += 0.5*FF2(norm_ff2(x))`, `x = norm_out(x)`.

Listing shown for layer 0; substitute `{L}` in `0..16`.

| tensor | shape (ggml `ne`, fastest dim first) | dtype (f32 build) | dtype (NVIDIA q8_0) |
|---|---|---|---|
| `encoder.layers.0.norm_feed_forward1.weight` | `[512]` | F32 | F32 |
| `encoder.layers.0.norm_feed_forward1.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.feed_forward1.linear1.weight` | `[512, 2048]` | F32 | Q8_0 |
| `encoder.layers.0.feed_forward1.linear1.bias` | `[2048]` | F32 | F32 |
| `encoder.layers.0.feed_forward1.linear2.weight` | `[2048, 512]` | F32 | Q8_0 |
| `encoder.layers.0.feed_forward1.linear2.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.norm_conv.weight` | `[512]` | F32 | F32 |
| `encoder.layers.0.norm_conv.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.conv.pointwise_conv1.weight` | `[512, 1024]` | F32 | Q8_0 |
| `encoder.layers.0.conv.pointwise_conv1.bias` | `[1024]` | F32 | F32 |
| `encoder.layers.0.conv.depthwise_conv.weight` | `[9, 1, 512]` | F16 | F16 |
| `encoder.layers.0.conv.depthwise_conv.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.conv.batch_norm.weight` | `[512]` | F32 | F32 |
| `encoder.layers.0.conv.batch_norm.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.conv.batch_norm.running_mean` | `[512]` | F32 | F32 |
| `encoder.layers.0.conv.batch_norm.running_var` | `[512]` | F32 | F32 |
| `encoder.layers.0.conv.pointwise_conv2.weight` | `[512, 512]` | F32 | Q8_0 |
| `encoder.layers.0.conv.pointwise_conv2.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.norm_self_att.weight` | `[512]` | F32 | F32 |
| `encoder.layers.0.norm_self_att.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.self_attn.pos_bias_u` | `[64, 8]` | F32 | F32 |
| `encoder.layers.0.self_attn.pos_bias_v` | `[64, 8]` | F32 | F32 |
| `encoder.layers.0.self_attn.linear_q.weight` | `[512, 512]` | F32 | Q8_0 |
| `encoder.layers.0.self_attn.linear_q.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.self_attn.linear_k.weight` | `[512, 512]` | F32 | Q8_0 |
| `encoder.layers.0.self_attn.linear_k.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.self_attn.linear_v.weight` | `[512, 512]` | F32 | Q8_0 |
| `encoder.layers.0.self_attn.linear_v.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.self_attn.linear_out.weight` | `[512, 512]` | F32 | Q8_0 |
| `encoder.layers.0.self_attn.linear_out.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.self_attn.linear_pos.weight` | `[512, 512]` | F32 | Q8_0 |
| `encoder.layers.0.norm_feed_forward2.weight` | `[512]` | F32 | F32 |
| `encoder.layers.0.norm_feed_forward2.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.feed_forward2.linear1.weight` | `[512, 2048]` | F32 | Q8_0 |
| `encoder.layers.0.feed_forward2.linear1.bias` | `[2048]` | F32 | F32 |
| `encoder.layers.0.feed_forward2.linear2.weight` | `[2048, 512]` | F32 | Q8_0 |
| `encoder.layers.0.feed_forward2.linear2.bias` | `[512]` | F32 | F32 |
| `encoder.layers.0.norm_out.weight` | `[512]` | F32 | F32 |
| `encoder.layers.0.norm_out.bias` | `[512]` | F32 | F32 |

Notes:

- `self_attn.pos_bias_u` / `pos_bias_v` have `ne = [64, 8]` = `n_heads=8` x `d_head=64`
  (`untie_biases: true`, so every layer has its own pair).
- `self_attn.linear_pos` has **no bias** (rel-pos projection of the PE table).
- `conv.pointwise_conv1` is `[512, 1024]`: GLU doubles the channel count, halved back
  to 512 after the gate. The converter squeezes the trailing torch `(out, in, 1)`
  kernel dim, so these are plain matrices, not conv tensors.
- `conv.depthwise_conv.weight` `ne = [9, 1, 512]` — `conv_kernel_size = 9`, `groups=512`,
  symmetric padding 4 (`conv_context = "symmetric"`). F16 in both builds.
- `conv.batch_norm.*` is a real BatchNorm1d in **eval** mode: use
  `(x - running_mean) / sqrt(running_var + 1e-5) * weight + bias`. `num_batches_tracked`
  is dropped by the converter.
- all `norm_*` are LayerNorm with eps 1e-5.
- FF activation is SiLU/Swish (NeMo `ConformerFeedForward` default).

## 5. Encoder -> transformer projection

| tensor | shape (ggml `ne`, fastest dim first) | dtype (f32 build) | dtype (NVIDIA q8_0) |
|---|---|---|---|
| `encoder_proj.weight` | `[512, 192]` | F32 | Q8_0 |
| `encoder_proj.bias` | `[192]` | F32 | F32 |

`Linear(512, 192)` (`sortformer_modules.encoder_proj` in the checkpoint), followed in
NeMo by ReLU before the transformer stack.

## 6. Transformer blocks — `transformer.layers.{0..17}` (18 layers, d 192, inner 768)

All 18 layers carry an identical set of 16 tensors (288 total). **Post-LN**
(`pre_ln = false`): `x = layer_norm_1(x + attn(x))`, then `x = layer_norm_2(x + ff(x))`.
There is **no final layer norm tensor** — `pre_ln_final_layer_norm` only applies when
`pre_ln` is true, so it is absent here.

Listing shown for layer 0; substitute `{L}` in `0..17`.

| tensor | shape (ggml `ne`, fastest dim first) | dtype (f32 build) | dtype (NVIDIA q8_0) |
|---|---|---|---|
| `transformer.layers.0.layer_norm_1.weight` | `[192]` | F32 | F32 |
| `transformer.layers.0.layer_norm_1.bias` | `[192]` | F32 | F32 |
| `transformer.layers.0.first_sub_layer.query_net.weight` | `[192, 192]` | F32 | Q8_0 |
| `transformer.layers.0.first_sub_layer.query_net.bias` | `[192]` | F32 | F32 |
| `transformer.layers.0.first_sub_layer.key_net.weight` | `[192, 192]` | F32 | Q8_0 |
| `transformer.layers.0.first_sub_layer.key_net.bias` | `[192]` | F32 | F32 |
| `transformer.layers.0.first_sub_layer.value_net.weight` | `[192, 192]` | F32 | Q8_0 |
| `transformer.layers.0.first_sub_layer.value_net.bias` | `[192]` | F32 | F32 |
| `transformer.layers.0.first_sub_layer.out_projection.weight` | `[192, 192]` | F32 | Q8_0 |
| `transformer.layers.0.first_sub_layer.out_projection.bias` | `[192]` | F32 | F32 |
| `transformer.layers.0.layer_norm_2.weight` | `[192]` | F32 | F32 |
| `transformer.layers.0.layer_norm_2.bias` | `[192]` | F32 | F32 |
| `transformer.layers.0.second_sub_layer.dense_in.weight` | `[192, 768]` | F32 | Q8_0 |
| `transformer.layers.0.second_sub_layer.dense_in.bias` | `[768]` | F32 | F32 |
| `transformer.layers.0.second_sub_layer.dense_out.weight` | `[768, 192]` | F32 | Q8_0 |
| `transformer.layers.0.second_sub_layer.dense_out.bias` | `[192]` | F32 | F32 |

Notes:

- `first_sub_layer` is multi-head self-attention: 8 heads x `d_head = 24` over d 192,
  **absolute/no positional encoding, plain scaled dot-product** (not rel-pos).
- `second_sub_layer` is the position-wise FF, activation **ReLU** (`hidden_act: relu`).
- `layer_norm_1` is applied *after* the attention residual, `layer_norm_2` after the FF
  residual (NeMo `TransformerEncoder` post-LN ordering).

## 7. Sigmoid speaker head

| tensor | shape (ggml `ne`, fastest dim first) | dtype (f32 build) | dtype (NVIDIA q8_0) |
|---|---|---|---|
| `head.first_hidden_to_hidden.weight` | `[192, 192]` | F32 | F32 |
| `head.first_hidden_to_hidden.bias` | `[192]` | F32 | F32 |
| `head.single_hidden_to_spks.weight` | `[192, 4]` | F32 | F32 |
| `head.single_hidden_to_spks.bias` | `[4]` | F32 | F32 |

`head.first_hidden_to_hidden`: `Linear(192, 192)` + ReLU.
`head.single_hidden_to_spks`: `Linear(192, 4)` -> sigmoid -> per-frame probability for
each of the `num_speakers = 4` slots. Both stay F32 in every build.

`sortformer_modules.hidden_to_spks` (`(4, 384)` + bias) exists in the checkpoint but is
**unused at inference** and is deliberately not emitted.

## 8. State-dict entries deliberately dropped (21)

| checkpoint name | torch shape | why |
|---|---|---|
| `preprocessor.featurizer.window` | `(400,)` | rebuilt from config (hann, 400 samples) |
| `preprocessor.featurizer.fb` | `(1, 128, 257)` | re-emitted as `preprocessor.fb` |
| `encoder.layers.{0..16}.conv.batch_norm.num_batches_tracked` | `()` | eval-mode BN does not need it (17 entries) |
| `sortformer_modules.hidden_to_spks.weight` | `(4, 384)` | unused at inference |
| `sortformer_modules.hidden_to_spks.bias` | `(4,)` | unused at inference |

## 9. Dtype summary

| build | F32 | F16 | Q8_0 |
|---|---|---|---|
| this repo's `.f32.gguf` | 949 | 22 | 0 |
| NVIDIA's `.q8_0.gguf` | 652 | 22 | 297 |

The 22 F16 tensors are the same in both builds: the 5 `pre_encode.conv.*.weight`
kernels and the 17 `encoder.layers.{L}.conv.depthwise_conv.weight` kernels.
