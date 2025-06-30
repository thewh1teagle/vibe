use chrono::Local;
use eyre::anyhow::Context;
use eyre::{Context, ContextCompat, Result};
use rand::distributions::Alphanumeric;
use rand::Rng;
use std::env;
use std::path::PathBuf;

use crate::cmd::{get_commit_hash, get_cuda_version, get_x86_features};

pub fn get_local_time() -> String {
    let now = Local::now();
    now.format("%Y-%m-%d %H-%M-%S").to_string()
}

pub fn random_string(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

pub fn get_current_dir() -> Result<PathBuf> {
    let current_dir = env::current_exe().context("current_dir")?;
    let current_dir = current_dir.parent().context("current dir parent")?;
    Ok(current_dir.to_path_buf())
}

pub fn get_app_info() -> String {
    use tauri_plugin_os::{arch, platform, type_, version};
    let cuda_version = get_cuda_version();
    let commit = get_commit_hash();

    let arch = arch();
    let platform = platform();
    let os_ver = version();
    let os_type = type_();
    let models = "List of models"; // Replace with actual models fetching logic
    let x86_features = get_x86_features(); // Replace with actual x86 features fetching logic

    let info = format!(
        "Commit Hash: {}\n\
         Arch: {}\n\
         Platform: {}\n\
         OS: {}\n\
         OS Version: {}\n\
         Cuda Version: {}\n\
         Models: {}\n\
         X86 Features: {}",
        commit,
        arch,
        platform,
        os_type,
        os_ver,
        cuda_version,
        models,
        x86_features.unwrap_or_default()
    );

    info
}

pub fn get_issue_url(logs: String) -> String {
    let extra_info = get_app_info();
    format!("https://github.com/thewh1teagle/vibe/issues/new?assignees=octocat&labels=bug&projects=&template=bug_report.yaml&title=App+reports+bug&logs={}", urlencoding::encode(&format!("{}\n\n{}", extra_info, &logs)))
}

pub trait LogError<T> {
    fn log_error(self) -> Option<T>;
}

impl<T> LogError<T> for Result<T> {
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
