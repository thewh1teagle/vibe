use thiserror::Error;

#[derive(Debug, Error)]
pub enum WhisperError {
    #[error("model path contains an interior null byte")]
    InvalidModelPath,
    #[error("failed to initialize whisper context")]
    ContextInit,
    #[error("failed to convert text from whisper")]
    InvalidText,
    #[error("transcription failed with code {0}")]
    TranscriptionFailed(i32),
    #[error("operation was cancelled")]
    Cancelled,
}

pub type Result<T> = std::result::Result<T, WhisperError>;
