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
