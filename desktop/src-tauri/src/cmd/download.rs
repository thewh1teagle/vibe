use crate::error::LogError;
use eyre::{bail, Context, Result};
use futures::future::{AbortHandle, Abortable};
use futures_util::StreamExt;
use serde::Serialize;
use std::{
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{Emitter, Listener, Manager};

use super::ui::set_progress_bar;

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DownloadModelResult {
    Completed { path: String },
    Cancelled,
}

#[derive(Debug, PartialEq, Eq)]
enum DownloadOutcome {
    Completed,
    Cancelled,
}

fn partial_path(path: &Path) -> PathBuf {
    let mut partial = path.as_os_str().to_os_string();
    partial.push(".part");
    PathBuf::from(partial)
}

fn remove_if_exists(path: &Path) -> Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).context(format!("Failed to remove file {}", path.display())),
    }
}

fn publish_download(partial: &Path, destination: &Path) -> Result<()> {
    if !destination.exists() {
        return std::fs::rename(partial, destination).context(format!("Failed to move download to {}", destination.display()));
    }

    let mut backup = destination.as_os_str().to_os_string();
    backup.push(".backup");
    let backup = PathBuf::from(backup);
    remove_if_exists(&backup)?;
    std::fs::rename(destination, &backup).context(format!(
        "Failed to prepare existing file {} for replacement",
        destination.display()
    ))?;

    match std::fs::rename(partial, destination) {
        Ok(()) => {
            remove_if_exists(&backup)?;
            Ok(())
        }
        Err(error) => {
            if let Err(restore_error) = std::fs::rename(&backup, destination) {
                return Err(error).context(format!(
                    "Failed to publish {} and failed to restore the previous file: {}",
                    destination.display(),
                    restore_error
                ));
            }
            Err(error).context(format!("Failed to replace file {}", destination.display()))
        }
    }
}

async fn download_to_partial(
    app_handle: &tauri::AppHandle,
    url: &str,
    destination: &Path,
    show_system_progress: bool,
) -> Result<DownloadOutcome> {
    let partial = partial_path(destination);
    remove_if_exists(&partial)?;

    let (abort_handle, abort_registration) = AbortHandle::new_pair();
    let app_handle_listener = app_handle.clone();
    let listener_id = app_handle.listen("abort_download", move |_| {
        if show_system_progress {
            set_progress_bar(&app_handle_listener, None).log_error();
        }
        abort_handle.abort();
    });

    let operation = async {
        let client = reqwest::Client::new();
        let response = client.get(url).send().await?.error_for_status()?;
        let total_size = response.content_length().unwrap_or(0);
        let mut file = std::fs::File::create(&partial).context(format!("Failed to create file {}", partial.display()))?;
        let mut downloaded: u64 = 0;
        let callback_limit: u64 = 1024 * 1024 * 2;
        let mut callback_offset: u64 = 0;
        let mut stream = response.bytes_stream();

        while let Some(item) = stream.next().await {
            let chunk = item.context("Error while downloading file")?;
            file.write_all(&chunk)
                .context(format!("Error while writing to file {}", partial.display()))?;
            downloaded += chunk.len() as u64;

            if total_size > 0 && downloaded > callback_offset + callback_limit {
                let percentage = (downloaded as f64 / total_size as f64) * 100.0;
                tracing::trace!("percentage: {}", percentage);
                if show_system_progress {
                    set_progress_bar(app_handle, Some(percentage)).log_error();
                }
                if let Some(window) = app_handle.get_webview_window("main") {
                    window.emit("download_progress", (downloaded, total_size)).log_error();
                }
                callback_offset = downloaded;
            }
        }

        if total_size > 0 && downloaded != total_size {
            bail!("Incomplete download: expected {} bytes, received {}", total_size, downloaded);
        }

        file.flush().context(format!("Failed to flush file {}", partial.display()))?;
        drop(file);
        publish_download(&partial, destination)?;
        Ok(DownloadOutcome::Completed)
    };

    let result = match Abortable::new(operation, abort_registration).await {
        Ok(result) => result,
        Err(_) => Ok(DownloadOutcome::Cancelled),
    };

    app_handle.unlisten(listener_id);
    if show_system_progress {
        set_progress_bar(app_handle, None).log_error();
    }

    if !matches!(&result, Ok(DownloadOutcome::Completed)) {
        remove_if_exists(&partial).log_error();
    }

    result
}

#[tauri::command]
pub async fn download_model(app_handle: tauri::AppHandle, url: String, path: String) -> Result<DownloadModelResult> {
    tracing::debug!("Download model invoked! with path {}", path);

    match download_to_partial(&app_handle, &url, Path::new(&path), true).await? {
        DownloadOutcome::Completed => Ok(DownloadModelResult::Completed { path }),
        DownloadOutcome::Cancelled => Ok(DownloadModelResult::Cancelled),
    }
}

#[tauri::command]
pub async fn download_file(app_handle: tauri::AppHandle, url: String, path: String) -> Result<()> {
    tracing::debug!("Download file invoked! with path {}", path);

    match download_to_partial(&app_handle, &url, Path::new(&path), false).await? {
        DownloadOutcome::Completed => Ok(()),
        DownloadOutcome::Cancelled => bail!("Download cancelled"),
    }
}

#[cfg(test)]
mod tests {
    use super::{partial_path, publish_download, remove_if_exists};
    use std::{fs, path::PathBuf, time::SystemTime};

    fn test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("vibe-download-{name}-{}-{unique}", std::process::id()))
    }

    #[test]
    fn partial_path_keeps_the_model_extension_out_of_the_final_suffix() {
        assert_eq!(
            partial_path(PathBuf::from("model.bin").as_path()),
            PathBuf::from("model.bin.part")
        );
    }

    #[test]
    fn publish_download_moves_a_complete_partial_file() {
        let dir = test_dir("publish");
        fs::create_dir_all(&dir).unwrap();
        let destination = dir.join("model.bin");
        let partial = partial_path(&destination);
        fs::write(&partial, b"complete model").unwrap();

        publish_download(&partial, &destination).unwrap();

        assert_eq!(fs::read(&destination).unwrap(), b"complete model");
        assert!(!partial.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn publish_download_replaces_an_existing_file_without_leaving_a_backup() {
        let dir = test_dir("replace");
        fs::create_dir_all(&dir).unwrap();
        let destination = dir.join("yt-dlp");
        let partial = partial_path(&destination);
        let backup = dir.join("yt-dlp.backup");
        fs::write(&destination, b"old binary").unwrap();
        fs::write(&partial, b"new binary").unwrap();

        publish_download(&partial, &destination).unwrap();

        assert_eq!(fs::read(&destination).unwrap(), b"new binary");
        assert!(!partial.exists());
        assert!(!backup.exists());
        remove_if_exists(&destination).unwrap();
        fs::remove_dir_all(dir).unwrap();
    }
}
