pub const LOG_FILENAME_PREFIX: &str = "log";
pub const LOG_FILENAME_SUFFIX: &str = ".txt";
pub const DEFAULT_LOG_DIRECTIVE: &str = "vibe=DEBUG";
pub const STORE_FILENAME: &str = "app_config.json";
pub const DOCUMENTS_SUBFOLDER: &str = "Vibe";

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;
