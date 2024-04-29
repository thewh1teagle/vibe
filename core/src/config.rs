use core::fmt;
use dirs_next;
use eyre::{OptionExt, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const APP_ID: &str = "github.com.thewh1teagle.vibe";
pub const URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true";
pub const FILENAME: &str = "ggml-medium.bin";
// NOT a regular hash!! see integrity.rs
pub const HASH: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

pub fn get_model_path() -> Result<PathBuf> {
    let app_config = dirs_next::data_local_dir()
        .ok_or_eyre("Can't get data directory")?
        .join(APP_ID);
    std::fs::create_dir_all(&app_config)?;
    let filepath = app_config.join(FILENAME);
    Ok(filepath)
}

#[derive(Deserialize, Serialize)]
pub struct ModelArgs {
    pub path: PathBuf,
    pub model: PathBuf,
    pub lang: Option<String>,
    pub verbose: bool,

    pub n_threads: Option<i32>,
    pub init_prompt: Option<String>,
    pub temperature: Option<f32>,
}

impl fmt::Debug for ModelArgs {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let json_string = serde_json::to_string_pretty(self).map_err(|_| fmt::Error)?;
        write!(f, "{}", json_string)
    }
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
