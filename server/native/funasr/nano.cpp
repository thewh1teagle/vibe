#include "worker.hpp"
#include "nano-engine.inc"

namespace {
using namespace vibe_worker;

struct LlamaBackend {
    LlamaBackend() {
        llama_log_set(log_stderr, nullptr);
        ggml_backend_load_all();
        llama_backend_init();
    }
    ~LlamaBackend() { llama_backend_free(); }
};

struct EncoderWeights {
    enc_model value;
    // Freed before value's ctx_w: the tensors live in this buffer.
    Buffer weights;
    ~EncoderWeights() { if (value.ctx_w) ggml_free(value.ctx_w); }
};

class Nano {
    LlamaBackend runtime;
    EncoderWeights encoder;
    Owner<llama_model, llama_model_free> model;
    Owner<llama_context, llama_free> context;
    Owner<llama_sampler, llama_sampler_free> sampler;
    Device device;
    const llama_vocab *vocab = nullptr;
    std::vector<llama_token> prefix, suffix;
    static constexpr int context_size = 2048;
    static constexpr int predictions = 512;

    std::vector<llama_token> tokenize(const std::string &text) const {
        int needed = llama_tokenize(vocab, text.data(), static_cast<int>(text.size()),
                                    nullptr, 0, false, true);
        require(needed < 0 && needed >= -context_size, "failed to size prompt tokens");
        std::vector<llama_token> tokens(static_cast<size_t>(-needed));
        int count = llama_tokenize(vocab, text.data(), static_cast<int>(text.size()),
                                   tokens.data(), static_cast<int>(tokens.size()), false, true);
        require(count > 0 && size_t(count) <= tokens.size(), "failed to tokenize prompt");
        tokens.resize(static_cast<size_t>(count));
        return tokens;
    }

    std::string piece(llama_token token) const {
        std::vector<char> buffer(256);
        for (;;) {
            int count = llama_token_to_piece(vocab, token, buffer.data(),
                                             static_cast<int>(buffer.size()), 0, true);
            if (count >= 0) {
                require(size_t(count) <= buffer.size(), "invalid token piece length");
                return std::string(buffer.data(), static_cast<size_t>(count));
            }
            size_t needed = static_cast<size_t>(-int64_t(count));
            require(needed > buffer.size() && needed < max_output, "token piece exceeds output limit");
            buffer.resize(needed);
        }
    }

    std::vector<float> run_encoder_checked(std::vector<float> fbank, int frames, int &width) {
        auto &m = encoder.value;
        constexpr int features = 560;
        float scale = std::sqrt(float(m.c.d_model));
        for (auto &value : fbank) value *= scale;
        add_posenc(fbank, frames, features);
        finite(fbank, "non-finite encoder input");
        Graph graph{device};
        auto *c = graph.context.get();
        auto *input = ggml_new_tensor_2d(c, GGML_TYPE_F32, features, frames);
        ggml_set_input(input);
        auto *x = sanm_layer(c, m, "audio_encoder.encoders0.0.", input, frames, false);
        for (int i = 0; i < m.c.num_blocks - 1; ++i)
            x = sanm_layer(c, m, "audio_encoder.encoders." + std::to_string(i) + ".", x, frames, true);
        x = lnorm(c, x, m.g("audio_encoder.after_norm.weight"), m.g("audio_encoder.after_norm.bias"));
        for (int i = 0; i < m.c.tp_blocks; ++i)
            x = sanm_layer(c, m, "audio_encoder.tp_encoders." + std::to_string(i) + ".", x, frames, true);
        x = lnorm(c, x, m.g("audio_encoder.tp_norm.weight"), m.g("audio_encoder.tp_norm.bias"));
        x = lin(c, m.g("audio_adaptor.linear1.weight"), m.g("audio_adaptor.linear1.bias"), x);
        x = ggml_relu(c, x);
        x = lin(c, m.g("audio_adaptor.linear2.weight"), m.g("audio_adaptor.linear2.bias"), x);
        for (int i = 0; i < m.c.adp_layers; ++i)
            x = adp_layer(c, m, "audio_adaptor.blocks." + std::to_string(i) + ".", x, frames);
        ggml_set_output(x);
        auto *forward = ggml_new_graph_custom(c, 32768, false);
        ggml_build_forward_expand(forward, x);
        graph.allocate(forward);
        ggml_backend_tensor_set(input, fbank.data(), 0, ggml_nbytes(input));
        graph.compute(forward, "Nano encoder");
        width = static_cast<int>(x->ne[0]);
        require(width == m.c.adp_llm && x->ne[1] == frames && x->type == GGML_TYPE_F32 &&
                ggml_nelements(x) == int64_t(width) * frames, "unexpected encoder output shape");
        std::vector<float> output(size_t(width) * frames);
        ggml_backend_tensor_get(x, output.data(), 0, ggml_nbytes(x));
        finite(output, "non-finite encoder output");
        return output;
    }

public:
    explicit Nano(const Options &args) {
        device = select_device(args.device);
        auto &m = encoder.value;
        encoder.weights = load_weights(args.encoder.c_str(), device.buffer_type, m, [&m](gguf_context *gguf) {
            // load_enc's key reads, with the value type validated instead of trusted.
            auto read = [gguf](const char *key, int fallback) {
                auto index = gguf_find_key(gguf, key);
                if (index < 0) return fallback;
                require(gguf_get_kv_type(gguf, index) == GGUF_TYPE_UINT32,
                        std::string("invalid encoder metadata type: ") + key);
                auto value = gguf_get_val_u32(gguf, index);
                require(value <= uint32_t(std::numeric_limits<int>::max()),
                        "encoder metadata integer overflow");
                return int(value);
            };
            auto &c = m.c;
            c.d_model = read("funasr.enc.output_size", 512);
            c.n_head = read("funasr.enc.attention_heads", 4);
            c.num_blocks = read("funasr.enc.num_blocks", 50);
            c.tp_blocks = read("funasr.enc.tp_blocks", 20);
            c.kernel = read("funasr.enc.kernel_size", 11);
            c.adp_llm = read("funasr.adp.llm_dim", 1024);
            c.adp_layers = read("funasr.adp.n_layer", 2);
            c.adp_head = read("funasr.adp.attention_heads", 8);
        });
        check_encoder(m, "audio_encoder.");
        require(m.c.adp_llm > 0 && m.c.adp_llm <= 8192 && m.c.adp_head > 0 &&
                m.c.adp_llm % m.c.adp_head == 0 && m.c.adp_layers >= 0 &&
                m.c.adp_layers <= 128, "invalid Nano adaptor configuration");
        for (const char *name : {"linear1", "linear2"}) {
            tensor(m, std::string("audio_adaptor.") + name + ".weight");
            tensor(m, std::string("audio_adaptor.") + name + ".bias");
        }
        for (int i = 0; i < m.c.adp_layers; ++i)
            check_layer(m, "audio_adaptor.blocks." + std::to_string(i) + ".", true);

        auto mp = llama_model_default_params();
        mp.n_gpu_layers = device.cpu ? 0 : 99;
        model.reset(llama_model_load_from_file(args.model.c_str(), mp));
        require(bool(model), "failed to load Nano language model");
        require(llama_model_n_embd(model.get()) == m.c.adp_llm, "encoder and language model widths differ");
        vocab = llama_model_get_vocab(model.get());
        require(vocab != nullptr && llama_vocab_n_tokens(vocab) > 0, "language model vocabulary is empty");
        auto cp = llama_context_default_params();
        cp.n_ctx = context_size;
        cp.n_batch = context_size;
        cp.n_ubatch = context_size;
        cp.n_threads = cpu_threads;
        cp.n_threads_batch = cpu_threads;
        context.reset(llama_init_from_model(model.get(), cp));
        require(bool(context), "failed to create Nano language context");
        require(llama_n_ctx(context.get()) >= context_size && llama_get_memory(context.get()),
                "invalid Nano language context");
        sampler.reset(llama_sampler_init_greedy());
        require(bool(sampler), "failed to create greedy sampler");
        prefix = tokenize("<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\n语音转写：");
        suffix = tokenize("<|im_end|>\n<|im_start|>assistant\n");
    }

    std::string transcribe(std::vector<float> audio) {
        struct Reset {
            llama_context *context;
            llama_sampler *sampler;
            void clear() const noexcept {
                llama_memory_clear(llama_get_memory(context), true);
                llama_sampler_reset(sampler);
            }
            ~Reset() { clear(); }
        } reset{context.get(), sampler.get()};
        reset.clear();
        int frames = 0;
        auto fbank = compute_fbank(std::move(audio), frames);
        finite(fbank, "non-finite fbank");
        int output_length = 1 + (frames - 3 + 2) / 2;
        output_length = 1 + (output_length - 3 + 2) / 2;
        int audio_tokens = (output_length - 1) / 2 + 1;
        require(audio_tokens > 0 && audio_tokens <= frames &&
                prefix.size() + size_t(audio_tokens) + suffix.size() + predictions <= context_size,
                "Nano prompt, audio and 512 predictions exceed context 2048");
        int width = 0;
        auto embeddings = run_encoder_checked(std::move(fbank), frames, width);
        int past = 0;
        auto decode = [&](int count, llama_token *tokens, float *values, bool logits) {
            int status = decode_batch(context.get(), count, tokens, values, width, past, logits);
            require(status == 0, "Nano llama_decode failed: " + std::to_string(status));
        };
        decode(static_cast<int>(prefix.size()), prefix.data(), nullptr, false);
        decode(audio_tokens, nullptr, embeddings.data(), false);
        decode(static_cast<int>(suffix.size()), suffix.data(), nullptr, true);
        std::string text;
        for (int i = 0; i < predictions; ++i) {
            llama_token token = llama_sampler_sample(sampler.get(), context.get(), -1);
            require(token >= 0 && token < llama_vocab_n_tokens(vocab), "invalid sampled token");
            if (llama_vocab_is_eog(vocab, token)) break;
            auto fragment = piece(token);
            require(text.size() + fragment.size() < max_output, "transcript exceeds output limit");
            text += fragment;
            decode(1, &token, nullptr, true);
        }
        return text == "/sil" ? "" : text;
    }
};
}

int main(int argc, char **argv) {
    return vibe_worker::run<Nano>(argc, argv, "funasr-nano", true);
}
