use anyhow::{Context, Result};
use dirs_next;
use std::path::PathBuf;

pub const APP_ID: &str = "github.com.thewh1teagle.vibe";
pub const URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true";
pub const FILENAME: &str = "ggml-medium.bin";
pub const HASH: &str = ""; // TODO

pub fn get_model_path() -> Result<PathBuf> {
    let app_config = dirs_next::data_dir().context("Can't get data directory")?.join(APP_ID);
    std::fs::create_dir_all(&app_config)?;
    let filepath = app_config.join(FILENAME);
    Ok(filepath)
}

pub struct ModelArgs {
    pub path: PathBuf,
    pub model: PathBuf,
    pub lang: Option<String>,
    pub verbose: bool,

    pub n_threads: Option<i32>,
}

#[cfg(test)]
mod tests {
    use super::get_model_path;
    #[test]
    fn test_get_mode_path() {
        let path = get_model_path().unwrap();
        println!("data path is {}", path.display());
    }
}
