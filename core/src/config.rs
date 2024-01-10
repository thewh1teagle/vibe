use crate::language::Language;
use anyhow::Result;
use app_dirs2;
use app_dirs2::{app_root, AppDataType, AppInfo};
use clap::{ArgAction, Parser};
use std::path::PathBuf;

pub const URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true";
pub const FILENAME: &str = "ggml-medium.bin";
pub const HASH: &str = ""; // TODO
pub const APP_INFO: AppInfo = AppInfo {
    name: "ruscribe",
    author: "github.com.thewh1teagle",
};

pub fn get_model_path() -> Result<PathBuf> {
    let app_config = app_root(AppDataType::UserData, &APP_INFO)?;
    let filepath = app_config.join(FILENAME);
    Ok(filepath)
}

pub struct ModelArgs {
    pub path: PathBuf,
    pub output: PathBuf,
    pub model: PathBuf,
    pub lang: Option<Language>,
    pub verbose: bool,

    pub n_threads: Option<i32>,
}
