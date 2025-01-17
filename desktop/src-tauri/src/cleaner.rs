use crate::utils::LogError;
use crate::{cmd::get_logs_folder, config, logging::get_log_path};
use eyre::{eyre, ContextCompat, Result};
use vibe_core::get_vibe_temp_folder;

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

pub fn clean_old_files() -> Result<()> {
    let current_temp_dir = get_vibe_temp_folder();
    let temp_dir = std::env::temp_dir();
    let temp_dir = temp_dir.to_str().unwrap_or_default();
    // Remove suffix
    let temp_dir = temp_dir.strip_suffix('/').unwrap_or(temp_dir);
    let temp_dir = temp_dir.strip_suffix('\\').unwrap_or(temp_dir);
    let pattern = format!("{}/vibe_temp*", temp_dir);
    tracing::debug!("searching old files in {}", pattern);
    for path in glob::glob(&pattern)? {
        let path = path?;
        if path == current_temp_dir {
            tracing::debug!("Skip deletion of {}", current_temp_dir.display());
            continue;
        }
        tracing::debug!("Clean old folder {}", path.clone().display());
        std::fs::remove_dir_all(path.clone())
            .map_err(|e| eyre!("failed to delete {}: {:?}", path.display(), e))
            .log_error();
    }
    Ok(())
}

pub fn clean_updater_files() -> Result<()> {
    let current_temp_dir = get_vibe_temp_folder();
    let temp_dir = std::env::temp_dir();
    let temp_dir = temp_dir.to_str().unwrap_or_default();
    // Remove suffix
    let temp_dir = temp_dir.strip_suffix('/').unwrap_or(temp_dir);
    let temp_dir = temp_dir.strip_suffix('\\').unwrap_or(temp_dir);
    let pattern = format!("{}/vibe*-updater*", temp_dir);
    tracing::debug!("searching old files in {}", pattern);
    for path in glob::glob(&pattern)? {
        let path = path?;
        if path == current_temp_dir {
            tracing::debug!("Skip deletion of {}", current_temp_dir.display());
            continue;
        }
        if path.is_dir() {
            tracing::debug!("Clean old folder {}", path.display());
            std::fs::remove_dir_all(&path)
                .map_err(|e| eyre!("failed to delete {}: {:?}", path.display(), e))
                .log_error();
        } else {
            tracing::debug!("Skipping non-directory path {}", path.display());
        }
    }
    Ok(())
}
