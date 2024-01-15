use anyhow::{Context, Result};
use dirs_next;
use serde::Deserialize;
use std::path::PathBuf;

pub const APP_ID: &str = "github.com.thewh1teagle.vibe";
pub const URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true";
pub const FILENAME: &str = "ggml-medium.bin";
// NOT a regular hash!! see integrity.rs
pub const HASH: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

pub fn get_model_path() -> Result<PathBuf> {
    let app_config = dirs_next::data_local_dir().context("Can't get data directory")?.join(APP_ID);
    std::fs::create_dir_all(&app_config)?;
    let filepath = app_config.join(FILENAME);
    Ok(filepath)
}

#[derive(Debug, Deserialize)]
pub struct ModelArgs {
    pub path: PathBuf,
    pub model: PathBuf,
    pub lang: Option<String>,
    pub verbose: bool,

    pub n_threads: Option<i32>,
    pub init_prompt: Option<String>,
    pub temperature: Option<f32>,
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
