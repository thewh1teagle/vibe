use crate::{cmd::get_logs_folder, config, logging::get_log_path};
use eyre::{ContextCompat, Result};

pub fn clean_old_logs(app: &tauri::AppHandle) -> Result<()> {
    tracing::debug!("clean old logs");
    let current_log_path = get_log_path(&app.clone())?;

    // Get logs folder
    let logs_folder = get_logs_folder(app.to_owned())?;
    let logs_folder = logs_folder.to_str().context("tostr")?;

    // Remove suffix
    let logs_folder = logs_folder.strip_suffix('/').unwrap_or(logs_folder);
    let logs_folder = logs_folder.strip_suffix('\\').unwrap_or(logs_folder);
    let pattern = format!(
        "{}/{}*{}",
        logs_folder,
        config::LOG_FILENAME_PREFIX,
        config::LOG_FILENAME_SUFFIX
    );
    tracing::debug!("searching old logs in {}", pattern);
    for path in glob::glob(&pattern)? {
        let path = path?;
        if path == current_log_path {
            tracing::debug!("Skip clean of current log path {}", path.display());
            continue;
        }
        tracing::debug!("clean old log {}", path.display());
        std::fs::remove_file(path)?;
    }
    Ok(())
}
