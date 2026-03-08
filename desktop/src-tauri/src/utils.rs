use chrono::Local;
use rand::distr::Alphanumeric;
use rand::Rng;

use crate::cmd::{get_commit_hash, is_avx2_enabled};

pub fn get_local_time() -> String {
    let now = Local::now();
    now.format("%Y-%m-%d %H-%M-%S").to_string()
}

pub fn random_string(length: usize) -> String {
    rand::rng().sample_iter(&Alphanumeric).take(length).map(char::from).collect()
}

pub fn get_app_info() -> String {
    use tauri_plugin_os::{arch, platform, type_, version};
    let commit = get_commit_hash();

    let arch = arch();
    let platform = platform();
    let os_ver = version();
    let os_type = type_();
    let models = "List of models"; // Replace with actual models fetching logic

    let info = format!(
        "Commit Hash: {}\n\
         Arch: {}\n\
         Platform: {}\n\
         OS: {}\n\
         OS Version: {}\n\
         Models: {}\n\
         AVX2: {}",
        commit,
        arch,
        platform,
        os_type,
        os_ver,
        models,
        is_avx2_enabled()
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
