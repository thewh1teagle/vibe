//! Native Zipformer2 transducer ASR inference built on vibe-server's shared GGML runtime.

mod decoder;
mod encoder;
mod fbank;
mod layer;
mod load;
mod model;
mod ops;
#[cfg(test)]
mod parity;
mod runtime;
mod search;
mod segment;
mod tokenizer;

pub use ggml_rs_sys as sys;
pub use model::{LongFormTranscription, Model, ModelInfo, Transcription};
pub use search::Token;
pub use tokenizer::Tokenizer;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("model path contains an interior NUL")]
    InvalidPath,
    #[error("failed to load GGUF model: {0}")]
    Load(String),
    #[error("missing GGUF metadata key: {0}")]
    MissingMetadata(&'static str),
    #[error("invalid GGUF metadata {key}: {message}")]
    InvalidMetadata { key: &'static str, message: String },
    #[error("unsupported model architecture {0:?}; expected zipformer2")]
    UnsupportedArchitecture(String),
    #[error("unsupported Zipformer head {0:?}; expected transducer")]
    UnsupportedHead(String),
    #[error("model is missing required tensor {0}")]
    MissingTensor(String),
    #[error("unsupported transcription language {0:?}")]
    UnsupportedLanguage(String),
    #[error("GGML operation failed: {0}")]
    Ggml(&'static str),
    #[error("VAD failed: {0}")]
    Vad(String),
    #[error("transcription aborted")]
    Aborted,
}

pub type Result<T> = std::result::Result<T, Error>;
