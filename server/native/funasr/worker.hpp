#pragma once

#include "ggml.h"
#include "ggml-alloc.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "gguf.h"
#include <nlohmann/json.hpp>

#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <filesystem>
#include <fstream>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <type_traits>
#include <utility>
#include <vector>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

namespace vibe_worker {

constexpr size_t max_input = 64 * 1024;
constexpr size_t max_output = 1024 * 1024;
constexpr int cpu_threads = 8;
using Json = nlohmann::json;

inline void require(bool ok, const std::string &message) {
    if (!ok) throw std::runtime_error(message);
}

template<auto Release> struct Deleter {
    template<class T> void operator()(T *ptr) const noexcept {
        if (ptr) Release(ptr);
    }
};
template<class T, auto Release> using Owner = std::unique_ptr<T, Deleter<Release>>;
using Backend = Owner<std::remove_pointer_t<ggml_backend_t>, ggml_backend_free>;
using Context = Owner<ggml_context, ggml_free>;
using Buffer = Owner<std::remove_pointer_t<ggml_backend_buffer_t>, ggml_backend_buffer_free>;

// A compute device picked the way whisper picks one (whisper_backend_init):
// GPU device `index` when requested and present, else the CPU. Weights live in
// `buffer_type`; graphs run through a scheduler over `backend` with `fallback`
// (CPU) picking up ops the device does not implement, e.g. SANM's pad_ext on
// Metal.
struct Device {
    Backend backend;
    Backend fallback;
    ggml_backend_buffer_type_t buffer_type = nullptr;
    bool cpu = true;
};

inline Device select_device(int index) {
    Device device;
    ggml_backend_load_all();
    if (index >= 0) {
        int seen = 0;
        for (size_t i = 0; i < ggml_backend_dev_count() && !device.backend; ++i) {
            ggml_backend_dev_t dev = ggml_backend_dev_get(i);
            auto type = ggml_backend_dev_type(dev);
            if (type != GGML_BACKEND_DEVICE_TYPE_GPU && type != GGML_BACKEND_DEVICE_TYPE_IGPU)
                continue;
            if (seen++ != index) continue;
            Backend backend(ggml_backend_dev_init(dev, nullptr));
            if (!backend) {
                std::fprintf(stderr, "failed to initialize GPU device %d\n", index);
                break;
            }
            std::fprintf(stderr, "using GPU %s (%s)\n", ggml_backend_dev_name(dev),
                         ggml_backend_dev_description(dev));
            device.buffer_type = ggml_backend_dev_buffer_type(dev);
            device.backend = std::move(backend);
            device.cpu = false;
        }
        if (!device.backend) std::fprintf(stderr, "no GPU device %d; using the CPU\n", index);
    }
    if (!device.backend) {
        device.backend.reset(ggml_backend_cpu_init());
        device.buffer_type = ggml_backend_cpu_buffer_type();
        require(bool(device.backend) && device.buffer_type, "failed to initialize CPU backend");
    } else {
        device.fallback.reset(ggml_backend_cpu_init());
        require(bool(device.fallback), "failed to initialize CPU fallback backend");
    }
    if (device.cpu) ggml_backend_cpu_set_n_threads(device.backend.get(), cpu_threads);
    else ggml_backend_cpu_set_n_threads(device.fallback.get(), cpu_threads);
    return device;
}

struct Graph {
    Context context{ggml_init({size_t(1024) * 1024 * 1024, nullptr, true})};
    ggml_backend_sched_t sched = nullptr;

    explicit Graph(const Device &device) {
        require(bool(context), "failed to allocate graph context");
        ggml_backend_t backends[2] = {device.backend.get(), device.fallback.get()};
        int count = device.fallback ? 2 : 1;
        sched = ggml_backend_sched_new(backends, nullptr, count, 32768, false, false);
        require(sched != nullptr, "failed to create graph scheduler");
    }
    ~Graph() { if (sched) ggml_backend_sched_free(sched); }
    Graph(const Graph &) = delete;
    Graph &operator=(const Graph &) = delete;

    void allocate(ggml_cgraph *graph) {
        ggml_backend_sched_reset(sched);
        require(ggml_backend_sched_alloc_graph(sched, graph), "failed to allocate graph");
    }

    void compute(ggml_cgraph *graph, const char *what) {
        auto status = ggml_backend_sched_graph_compute_async(sched, graph);
        ggml_backend_sched_synchronize(sched);
        require(status == GGML_STATUS_SUCCESS, std::string(what) + " compute failed");
    }
};

// Loads every GGUF tensor into a buffer of `type` so graphs can compute on that
// device. `read_metadata` runs while the GGUF context is alive, for the hparams
// keys the caller needs. Mirrors the sensevoice engine's load_model_weights.
template<class M, class Read>
Buffer load_weights(const char *path, ggml_backend_buffer_type_t type, M &m, Read &&read_metadata) {
    ggml_context *meta = nullptr;
    Owner<gguf_context, gguf_free> gguf(gguf_init_from_file(path, {true, &meta}));
    require(bool(gguf) && meta, std::string("failed to read GGUF: ") + path);
    read_metadata(gguf.get());
    const int64_t count = gguf_get_n_tensors(gguf.get());
    require(count > 0, "GGUF contains no tensors");
    require(m.ctx_w == nullptr, "weights are already loaded");
    m.ctx_w = ggml_init({size_t(count + 1) * ggml_tensor_overhead(), nullptr, true});
    require(m.ctx_w, "failed to create weight tensor context");
    std::ifstream input(path, std::ios::binary);
    require(bool(input), "cannot reopen GGUF for tensor data");
    const size_t base = gguf_get_data_offset(gguf.get());
    for (int64_t i = 0; i < count; ++i) {
        const char *name = gguf_get_tensor_name(gguf.get(), i);
        ggml_tensor *layout = ggml_get_tensor(meta, name);
        require(layout != nullptr, std::string("missing tensor metadata: ") + name);
        ggml_tensor *weight = ggml_dup_tensor(m.ctx_w, layout);
        require(weight != nullptr, "failed to duplicate tensor: " + std::string(name));
        ggml_set_name(weight, name);
        m.t.emplace(name, weight);
    }
    Buffer buffer(ggml_backend_alloc_ctx_tensors_from_buft(m.ctx_w, type));
    require(bool(buffer), "failed to allocate weight buffer");
    ggml_backend_buffer_set_usage(buffer.get(), GGML_BACKEND_BUFFER_USAGE_WEIGHTS);
    std::vector<unsigned char> bytes;
    for (int64_t i = 0; i < count; ++i) {
        const char *name = gguf_get_tensor_name(gguf.get(), i);
        ggml_tensor *weight = m.t.at(name);
        const size_t size = ggml_nbytes(weight);
        bytes.resize(size);
        input.seekg(std::streamoff(base + gguf_get_tensor_offset(gguf.get(), i)), std::ios::beg);
        input.read(reinterpret_cast<char *>(bytes.data()), std::streamsize(size));
        require(bool(input), std::string("failed to read tensor: ") + name);
        ggml_backend_tensor_set(weight, bytes.data(), 0, size);
    }
    return buffer;
}

inline void log_stderr(ggml_log_level, const char *text, void *) {
    std::fputs(text, stderr);
    std::fflush(stderr);
}

inline void finite(const std::vector<float> &values, const char *message) {
    for (float value : values) require(std::isfinite(value), message);
}

template<class M> ggml_tensor *tensor(M &m, const std::string &name) {
    auto it = m.t.find(name);
    require(it != m.t.end() && it->second, "missing tensor: " + name);
    return it->second;
}

template<class M> void check_layer(M &m, const std::string &prefix, bool adaptor = false) {
    for (const char *name : {"norm1", "norm2", "self_attn.linear_out",
                             "feed_forward.w_1", "feed_forward.w_2"}) {
        tensor(m, prefix + name + ".weight");
        tensor(m, prefix + name + ".bias");
    }
    if (adaptor) {
        for (const char *name : {"linear_q", "linear_k", "linear_v"}) {
            tensor(m, prefix + "self_attn." + name + ".weight");
            tensor(m, prefix + "self_attn." + name + ".bias");
        }
    } else {
        tensor(m, prefix + "self_attn.linear_q_k_v.weight");
        tensor(m, prefix + "self_attn.linear_q_k_v.bias");
        tensor(m, prefix + "self_attn.fsmn_block.weight");
    }
}

template<class M> void check_encoder(M &m, const std::string &prefix) {
    const auto &c = m.c;
    require(c.d_model > 0 && c.d_model <= 8192 && c.n_head > 0 &&
            c.d_model % c.n_head == 0 && c.num_blocks > 0 && c.num_blocks <= 128 &&
            c.tp_blocks >= 0 && c.tp_blocks <= 128 && c.kernel > 0 &&
            c.kernel <= 63 && c.kernel % 2 == 1, "invalid encoder configuration");
    check_layer(m, prefix + "encoders0.0.");
    for (int i = 0; i < c.num_blocks - 1; ++i)
        check_layer(m, prefix + "encoders." + std::to_string(i) + ".");
    for (int i = 0; i < c.tp_blocks; ++i)
        check_layer(m, prefix + "tp_encoders." + std::to_string(i) + ".");
    for (const char *name : {"after_norm", "tp_norm"}) {
        tensor(m, prefix + name + ".weight");
        tensor(m, prefix + name + ".bias");
    }
}

struct Options { std::string model, encoder; int device = -1; };

inline Options options(int argc, char **argv, bool nano) {
    Options result;
    for (int i = 1; i < argc; ++i) {
        std::string key = argv[i];
        require(key == "--model" || (nano && key == "--encoder") || key == "--device",
                "unsupported argument: " + key);
        require(i + 1 < argc, "missing value for " + key);
        if (key == "--device") {
            require(result.device == -1, "duplicate argument: " + key);
            char *end = nullptr;
            long value = std::strtol(argv[++i], &end, 10);
            require(end != argv[i] && *end == '\0' && value >= -1 && value <= 15,
                    "--device must be -1 (CPU) or a GPU index 0..15");
            result.device = static_cast<int>(value);
            continue;
        }
        auto &value = key == "--model" ? result.model : result.encoder;
        require(value.empty(), "duplicate argument: " + key);
        value = argv[++i];
        require(!value.empty(), "empty value for " + key);
    }
    require(!result.model.empty(), "--model is required");
    require(!nano || !result.encoder.empty(), "--encoder is required for FunASR Nano");
    return result;
}

inline std::vector<float> read_audio(const std::string &path) {
    static_assert(sizeof(float) == 4 && std::numeric_limits<float>::is_iec559);
    require(!path.empty() && path.find('\0') == std::string::npos, "invalid audio_path");
    require(std::filesystem::is_regular_file(path), "audio_path must be a regular file");
    std::ifstream input(path, std::ios::binary | std::ios::ate);
    require(bool(input), "cannot open audio file");
    auto length = input.tellg();
    require(length >= 400 * 4 && length <= 480000 * 4 && length % 4 == 0,
            "audio must contain 400..480000 little-endian f32 samples (16 kHz mono)");
    std::vector<unsigned char> bytes(static_cast<size_t>(length));
    input.seekg(0);
    input.read(reinterpret_cast<char *>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    require(bool(input) && input.peek() == std::char_traits<char>::eof(), "audio file changed or read failed");
    std::vector<float> audio(bytes.size() / 4);
    for (size_t i = 0; i < audio.size(); ++i) {
        const auto *p = bytes.data() + i * 4;
        uint32_t bits = uint32_t(p[0]) | (uint32_t(p[1]) << 8) |
                        (uint32_t(p[2]) << 16) | (uint32_t(p[3]) << 24);
        std::memcpy(&audio[i], &bits, sizeof(float));
    }
    finite(audio, "audio contains non-finite samples");
    return audio;
}

inline void emit(const Json &value) {
    auto line = value.dump(-1, ' ', false, Json::error_handler_t::replace);
    require(line.size() < max_output, "JSON output exceeds 1 MiB");
    line.push_back('\n');
    require(std::fwrite(line.data(), 1, line.size(), stdout) == line.size() &&
            std::fflush(stdout) == 0, "failed to write stdout");
}

inline void emit_error(uint64_t id, const std::string &message) noexcept {
    try {
        emit({{"type", "error"}, {"id", id}, {"message", message.substr(0, 4096)}});
    } catch (...) {
        std::fputs("failed to write worker error\n", stderr);
    }
}

class Inbox {
    struct State {
        std::mutex mutex;
        std::condition_variable changed;
        std::optional<std::string> pending;
        std::exception_ptr failure;
    };
    std::shared_ptr<State> state = std::make_shared<State>();

    static int next_byte() {
        int ch = std::fgetc(stdin);
        if (ch == EOF) {
            require(!std::ferror(stdin), "failed to read stdin");
            // EOF must terminate even while the inference thread is inside ggml.
            std::_Exit(0);
        }
        return ch;
    }

    static void read(const std::shared_ptr<State> &state) noexcept {
        try {
            for (;;) {
                std::string line;
                for (;;) {
                    int ch = next_byte();
                    require(line.size() + 1 <= max_input, "stdin line exceeds 64 KiB");
                    if (ch == '\n') break;
                    line.push_back(static_cast<char>(ch));
                }
                {
                    std::lock_guard<std::mutex> lock(state->mutex);
                    require(!state->pending, "more than one pending request");
                    state->pending = std::move(line);
                }
                state->changed.notify_one();
            }
        } catch (...) {
            {
                std::lock_guard<std::mutex> lock(state->mutex);
                state->failure = std::current_exception();
            }
            state->changed.notify_one();
            try { while (next_byte() != EOF) {} } catch (...) {}
        }
    }

public:
    Inbox() { std::thread([shared = state] { read(shared); }).detach(); }
    std::string take() {
        std::unique_lock<std::mutex> lock(state->mutex);
        state->changed.wait(lock, [&] { return state->pending || state->failure; });
        if (state->failure) std::rethrow_exception(state->failure);
        auto line = std::move(*state->pending);
        state->pending.reset();
        return line;
    }
};

template<class Engine> int run(int argc, char **argv, const char *name, bool nano) {
    try {
#ifdef _WIN32
        require(_setmode(_fileno(stdin), _O_BINARY) != -1 &&
                _setmode(_fileno(stdout), _O_BINARY) != -1, "failed to set binary stdio");
#endif
        auto args = options(argc, argv, nano);
        ggml_log_set(log_stderr, nullptr);
        ggml_time_init();
        Inbox inbox;
        Engine engine(args);
        emit({{"type", "ready"}, {"protocol", 1}, {"engine", name}});
        for (;;) {
            uint64_t id = 0;
            try {
                auto line = inbox.take();
                auto request = Json::parse(line, [](int depth, Json::parse_event_t, Json &) {
                    require(depth <= 16, "JSON nesting exceeds limit");
                    return true;
                });
                require(request.is_object() && request.contains("id") &&
                        request["id"].is_number_unsigned(), "id must be a u64");
                id = request["id"].template get<uint64_t>();
                require(request.size() == 2 && request.contains("audio_path") &&
                        request["audio_path"].is_string(), "expected only id and audio_path");
                auto audio = read_audio(request["audio_path"].template get<std::string>());
                auto text = engine.transcribe(std::move(audio));
                emit({{"type", "result"}, {"id", id}, {"text", text}});
            } catch (const std::exception &error) {
                emit_error(id, error.what());
                std::fprintf(stderr, "%s: %s\n", name, error.what());
                return 1;
            }
        }
    } catch (const std::exception &error) {
        std::fprintf(stderr, "%s: %s\n", name, error.what());
        return 1;
    }
}

}
