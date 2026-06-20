use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::Listener;
pub mod app;
pub mod audio;
pub mod download;
pub mod files;
pub mod sona_cmd;
pub mod transcribe;

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
        if let Some(api_err) = err.downcast_ref::<crate::sona::SonaApiError>() {
            CommandError {
                code: api_err.code.clone(),
                message: api_err.message.clone(),
            }
        } else {
            CommandError {
                code: "internal_error".to_string(),
                message: err.to_string(),
            }
        }
    }
}

/// RAII guard that listens for an abort event and unlistens on drop.
pub(crate) struct AbortGuard {
    app: tauri::AppHandle,
    id: tauri::EventId,
    flag: Arc<AtomicBool>,
}

impl AbortGuard {
    pub(crate) fn new(app: &tauri::AppHandle, event: &str) -> Self {
        let flag = Arc::new(AtomicBool::new(false));
        let abort_flag = flag.clone();
        let id = app.listen(event, move |_| {
            abort_flag.store(true, Ordering::Relaxed);
        });
        Self {
            app: app.clone(),
            id,
            flag,
        }
    }

    pub(crate) fn is_aborted(&self) -> bool {
        self.flag.load(Ordering::Relaxed)
    }
}

impl Drop for AbortGuard {
    fn drop(&mut self) {
        self.app.unlisten(self.id);
    }
}
