#include "worker.hpp"
#include "sensevoice-engine.inc"

namespace {
using namespace vibe_worker;

struct SenseVoiceWeights {
    model value;
    ~SenseVoiceWeights() { free_model(value); }
};

class SenseVoice {
    Device device;
    SenseVoiceWeights weights;
    std::vector<int> query_tokens;
    std::vector<std::string> vocab;
    std::vector<float> embeddings;
    static constexpr int features = 560;

    int metadata(const char *key, int fallback) const {
        auto *gg = weights.value.gguf;
        auto index = gguf_find_key(gg, key);
        if (index < 0) return fallback;
        require(gguf_get_kv_type(gg, index) == GGUF_TYPE_UINT32,
                std::string("invalid metadata type: ") + key);
        auto value = gguf_get_val_u32(gg, index);
        require(value <= uint32_t(std::numeric_limits<int>::max()), "metadata integer overflow");
        return static_cast<int>(value);
    }

    std::string run_segment(const std::vector<float> &fbank, int frames) {
        auto &m = weights.value;
        const int queries = static_cast<int>(query_tokens.size());
        const int count = queries + frames;
        const int width = m.c.d_model;
        const int vocab_size = m.c.vocab;
        std::vector<float> input(size_t(count) * features);
        for (int i = 0; i < queries; ++i)
            std::memcpy(input.data() + size_t(i) * features,
                        embeddings.data() + size_t(query_tokens[i]) * features, features * sizeof(float));
        std::memcpy(input.data() + size_t(queries) * features, fbank.data(), size_t(frames) * features * sizeof(float));
        float scale = std::sqrt(float(width));
        for (auto &value : input) value *= scale;
        add_posenc(input, count, features);
        finite(input, "non-finite SenseVoice input");
        Graph graph{device};
        auto *c = graph.context.get();
        auto *x = ggml_new_tensor_2d(c, GGML_TYPE_F32, features, count);
        ggml_set_input(x);
        auto *h = sanm_layer(c, m, "encoder.encoders0.0.", x, count, false);
        for (int i = 0; i < m.c.num_blocks - 1; ++i)
            h = sanm_layer(c, m, "encoder.encoders." + std::to_string(i) + ".", h, count, true);
        h = lnorm(c, h, m.g("encoder.after_norm.weight"), m.g("encoder.after_norm.bias"));
        for (int i = 0; i < m.c.tp_blocks; ++i)
            h = sanm_layer(c, m, "encoder.tp_encoders." + std::to_string(i) + ".", h, count, true);
        h = lnorm(c, h, m.g("encoder.tp_norm.weight"), m.g("encoder.tp_norm.bias"));
        auto *logits = lin(c, m.g("ctc.ctc_lo.weight"), m.g("ctc.ctc_lo.bias"), h);
        require(logits->ne[0] == vocab_size && logits->ne[1] == count &&
                logits->type == GGML_TYPE_F32 && ggml_nelements(logits) == int64_t(vocab_size) * count,
                "unexpected SenseVoice logits shape");
        ggml_set_output(logits);
        auto *forward = ggml_new_graph_custom(c, 32768, false);
        ggml_build_forward_expand(forward, logits);
        graph.allocate(forward);
        ggml_backend_tensor_set(x, input.data(), 0, ggml_nbytes(x));
        graph.compute(forward, "SenseVoice encoder");
        std::vector<float> scores(size_t(vocab_size) * count);
        ggml_backend_tensor_get(logits, scores.data(), 0, ggml_nbytes(logits));
        finite(scores, "non-finite SenseVoice logits");
        std::vector<int> ids;
        int previous = -1;
        for (int n = 0; n < count; ++n) {
            const float *column = scores.data() + size_t(n) * vocab_size;
            int best = 0;
            for (int v = 1; v < vocab_size; ++v)
                if (column[v] > column[best]) best = v;
            if (best != previous && best != m.c.blank) ids.push_back(best);
            previous = best;
        }
        return detok_sv(ids, vocab, false);
    }

public:
    explicit SenseVoice(const Options &args) {
        device = select_device(args.device);
        auto &m = weights.value;
        require(load_model_weights(args.model, device.buffer_type, m),
                "failed to load SenseVoice model");
        auto *gg = m.gguf;
        m.c.d_model = metadata("sv.output_size", 512);
        m.c.n_head = metadata("sv.attention_heads", 4);
        m.c.num_blocks = metadata("sv.num_blocks", 50);
        m.c.tp_blocks = metadata("sv.tp_blocks", 20);
        m.c.kernel = metadata("sv.kernel_size", 11);
        m.c.vocab = metadata("sv.vocab_size", 25055);
        m.c.blank = metadata("sv.blank_id", 0);
        require(m.c.vocab > 0 && m.c.vocab <= 262144 && m.c.blank >= 0 && m.c.blank < m.c.vocab,
                "invalid SenseVoice vocabulary configuration");
        auto vi = gguf_find_key(gg, "sv.vocab");
        require(vi >= 0 && gguf_get_kv_type(gg, vi) == GGUF_TYPE_ARRAY &&
                gguf_get_arr_type(gg, vi) == GGUF_TYPE_STRING &&
                gguf_get_arr_n(gg, vi) == size_t(m.c.vocab), "sv.vocab is required and must match sv.vocab_size");
        vocab.reserve(static_cast<size_t>(m.c.vocab));
        for (int i = 0; i < m.c.vocab; ++i) {
            const char *piece = gguf_get_arr_str(gg, vi, i);
            require(piece != nullptr, "invalid sv.vocab entry");
            vocab.emplace_back(piece);
        }
        auto qi = gguf_find_key(gg, "sv.query_tokens");
        require(qi >= 0 && gguf_get_kv_type(gg, qi) == GGUF_TYPE_ARRAY &&
                (gguf_get_arr_type(gg, qi) == GGUF_TYPE_INT32 ||
                 gguf_get_arr_type(gg, qi) == GGUF_TYPE_UINT32), "sv.query_tokens must be a 32-bit integer array");
        size_t queries = gguf_get_arr_n(gg, qi);
        require(queries > 0 && queries <= 16, "invalid SenseVoice query token count");
        const auto *query_data = static_cast<const unsigned char *>(gguf_get_arr_data(gg, qi));
        for (size_t i = 0; i < queries; ++i) {
            int32_t id;
            std::memcpy(&id, query_data + i * sizeof(id), sizeof(id));
            query_tokens.push_back(id);
        }
        check_encoder(m, "encoder.");
        tensor(m, "ctc.ctc_lo.weight");
        tensor(m, "ctc.ctc_lo.bias");
        auto *embed = tensor(m, "embed.weight");
        require(embed->ne[0] == features && embed->ne[1] > 0 &&
                embed->ne[2] == 1 && embed->ne[3] == 1, "unexpected SenseVoice embedding shape");
        for (int id : query_tokens)
            require(id >= 0 && id < embed->ne[1], "query token outside embedding range");
        embeddings.resize(static_cast<size_t>(ggml_nelements(embed)));
        if (embed->type == GGML_TYPE_F32) {
            ggml_backend_tensor_get(embed, embeddings.data(), 0, ggml_nbytes(embed));
        } else if (embed->type == GGML_TYPE_F16) {
            std::vector<ggml_fp16_t> half(embeddings.size());
            ggml_backend_tensor_get(embed, half.data(), 0, ggml_nbytes(embed));
            for (size_t i = 0; i < half.size(); ++i) embeddings[i] = ggml_fp16_to_fp32(half[i]);
        } else {
            throw std::runtime_error("SenseVoice embedding must be F32 or F16");
        }
        finite(embeddings, "non-finite SenseVoice embeddings");
        gguf_free(m.gguf);
        m.gguf = nullptr;
        ggml_free(m.ctx_meta);
        m.ctx_meta = nullptr;
    }

    std::string transcribe(std::vector<float> audio) {
        int frames = 0;
        auto fbank = compute_fbank(std::move(audio), frames);
        finite(fbank, "non-finite fbank");
        return run_segment(fbank, frames);
    }
};
}

int main(int argc, char **argv) {
    return vibe_worker::run<SenseVoice>(argc, argv, "sensevoice", false);
}
