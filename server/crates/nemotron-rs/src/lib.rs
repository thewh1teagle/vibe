//! Native Nemotron ASR inference built on Sona's shared GGML runtime.

mod decoder;
mod encoder;
mod mel;
mod model;
mod ops;
mod runtime;
mod segment;
mod tokenizer;

pub use decoder::Token;
pub use mel::{MelConfig, MelFeatures, MelFrontend};
pub use model::{LongFormTranscription, Transcription};
pub use model::{Model, ModelInfo};
pub use tokenizer::Tokenizer;
pub use ggml_rs_sys as sys;

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
    #[error("unsupported model architecture {0:?}; expected parakeet")]
    UnsupportedArchitecture(String),
    #[error("unsupported Parakeet head {0:?}; expected rnnt")]
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

/// Confirms that the shared GGML backend registry is available.
pub fn backend_device_count() -> usize {
    unsafe { sys::ggml_backend_dev_count() }
}

#[cfg(test)]
mod tests {
    #[test]
    fn shares_the_ggml_runtime() {
        let _ = super::backend_device_count();
    }
}
