pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Message(String),
    #[error("whisper-rs was built without the `ffi` feature")]
    FfiDisabled,
    #[error("invalid string contains interior NUL byte")]
    Nul(#[from] std::ffi::NulError),
    #[error("failed to read model file {path}: {source}")]
    ReadModel {
        path: std::path::PathBuf,
        source: std::io::Error,
    },
    #[error("model file is empty or corrupt: {0}")]
    EmptyModel(std::path::PathBuf),
    #[error("model file {path} is not a whisper.cpp model ({reason}, {size} bytes)")]
    CorruptModel {
        path: std::path::PathBuf,
        size: u64,
        reason: String,
    },
    #[error("model file {path} holds a '{kind}' model, not a whisper transcription model")]
    NotATranscriptionModel {
        path: std::path::PathBuf,
        kind: String,
    },
    #[error("model file {path} uses unsupported quantization (ftype {ftype})")]
    UnsupportedFtype {
        path: std::path::PathBuf,
        ftype: i32,
    },
    #[error("not enough memory to load {path}: needs {required} bytes, {available} bytes available")]
    InsufficientMemory {
        path: std::path::PathBuf,
        required: u64,
        available: u64,
    },
    #[error("failed to load model from {0}")]
    LoadModel(std::path::PathBuf),
    #[error("no samples")]
    NoSamples,
    #[error("transcription failed with code {0}")]
    TranscriptionFailed(i32),
    #[error("transcription aborted")]
    Aborted,
    #[error("vad_model_path is required when stable_timestamps is enabled")]
    MissingVadModel,
    #[error("failed to load VAD model from {0}")]
    LoadVadModel(std::path::PathBuf),
    #[error("failed to run VAD segmentation")]
    VadSegmentationFailed,

    // Engine-side errors from the pure-Rust whisper port.
    #[error("failed to open model file {0}")]
    OpenModel(std::path::PathBuf),
    #[error("invalid or unsupported model file")]
    ModelFormat,
    #[error("ggml operation failed: {0}")]
    Ggml(&'static str),
    /// A buffer or graph did not fit. `gpu` says which memory ran out, so a caller
    /// can retry on the CPU when it was the device's.
    #[error("out of {} memory allocating {what}", if *gpu { "GPU" } else { "CPU" })]
    OutOfMemory { what: &'static str, gpu: bool },
    #[error("unknown language {0:?}")]
    UnknownLanguage(String),
    #[error("failed to auto-detect language")]
    LanguageDetection,
    #[error("audio is too short to transcribe")]
    AudioTooShort,
}
