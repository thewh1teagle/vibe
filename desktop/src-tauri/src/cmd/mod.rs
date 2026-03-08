use serde::Serialize;
pub mod app;
pub mod audio;
pub mod download;
pub mod files;
pub mod permissions;
pub mod sona_cmd;
pub mod transcribe;
pub mod ui;
pub mod ytdlp;

pub use transcribe::TranscribeOptions;

/// Structured error response for Tauri commands
#[derive(Debug, Serialize, Clone)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl From<eyre::Error> for CommandError {
    fn from(err: eyre::Error) -> Self {
        CommandError {
            code: "internal_error".to_string(),
            message: err.to_string(),
        }
    }
}
