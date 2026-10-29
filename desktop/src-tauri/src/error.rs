pub trait LogError<T> {
    fn log_error(self) -> Option<T>;
}

impl<T, E: std::fmt::Debug> LogError<T> for std::result::Result<T, E> {
    fn log_error(self) -> Option<T> {
        match self {
            Ok(value) => Some(value),
            Err(ref e) => {
                tracing::error!("Error: {:?}", e);
                None
            }
        }
    }
}

/// What a Tauri command returns on failure. Tauri sends a command's error to the frontend
/// serialized, which `eyre::Report` cannot do, so this carries the report and serializes it as
/// its `Debug` text: the message, its causes, and the backtrace when one was captured.
#[derive(Debug)]
pub struct Error(eyre::Report);

impl<E: Into<eyre::Report>> From<E> for Error {
    fn from(error: E) -> Self {
        Self(error.into())
    }
}

impl Error {
    /// Back to a report, for code that calls a command function directly.
    pub fn into_report(self) -> eyre::Report {
        self.0
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&format!("{:?}", self.0))
    }
}

/// `Result` for Tauri commands; everything else keeps using `eyre::Result`.
pub type CommandResult<T> = std::result::Result<T, Error>;
