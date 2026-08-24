use crate::error::LogError;
use eyre::{bail, Context, Result};
use futures::future::{AbortHandle, Abortable};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{Emitter, Listener, Manager};

use super::ui::set_progress_bar;

/// GGML weights (`.bin`) start with `0x67676d6c` written little endian, so the first four bytes on
/// disk read `lmgg`. GGUF weights (`.gguf`) spell their magic out.
const GGML_MAGIC: &[u8; 4] = b"lmgg";
const GGUF_MAGIC: &[u8; 4] = b"GGUF";

/// The smallest model Vibe downloads is the Silero VAD at ~865 KiB. Anything below this is a
/// truncated stream or an HTML error page saved under a model name, never a model.
const MIN_MODEL_SIZE: u64 = 256 * 1024;

/// A locked destination (antivirus, or a sona process still holding the previous model open)
/// usually clears within a second, so retry the swap before giving up.
const PUBLISH_ATTEMPTS: u32 = 5;
const PUBLISH_RETRY_DELAY: Duration = Duration::from_millis(200);

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

/// What the catalog claims the finished file should be. Entries the user supplies themselves (the
/// settings URL field, the `vibe://download/?url=` deep link) carry none of this, so every field is
/// optional and verification degrades to the size and magic-byte checks.
#[derive(Debug, Default, Deserialize)]
pub struct DownloadIntegrity {
    pub size: Option<u64>,
    pub sha256: Option<String>,
}

/// Result of inspecting a model file already on disk. `reason` is the human readable explanation
/// shown to the user when the file turns out to be truncated or corrupt.
#[derive(Debug, Serialize)]
pub struct ModelFileCheck {
    pub path: String,
    pub valid: bool,
    pub size: u64,
    pub reason: Option<String>,
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

/// Only `.bin` and `.gguf` downloads are model weights. Everything else that goes through this
/// module (yt-dlp, the legacy ONNX embedding/segmentation models) has no magic we can rely on.
fn is_model_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("bin") | Some("gguf")
    )
}

fn read_magic(path: &Path) -> Result<[u8; 4]> {
    let mut file = std::fs::File::open(path).context(format!("Failed to open {}", path.display()))?;
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic)
        .context(format!("Failed to read the header of {}", path.display()))?;
    Ok(magic)
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path).context(format!("Failed to open {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .context(format!("Failed to read {} while hashing", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().iter().fold(String::new(), |mut hex, byte| {
        use std::fmt::Write as _;
        let _ = write!(hex, "{byte:02x}");
        hex
    }))
}

/// Minimum size plus GGML/GGUF magic. This is what stands between a truncated download (or an HTML
/// error page) and a file the app hands to sona as if it were a model.
pub fn validate_model_file(path: &Path) -> Result<()> {
    let size = std::fs::metadata(path)
        .context(format!("Failed to read the size of {}", path.display()))?
        .len();
    if size < MIN_MODEL_SIZE {
        bail!(
            "The model file {} is only {} bytes, so it is incomplete or corrupt",
            path.display(),
            size
        );
    }
    let magic = read_magic(path)?;
    if &magic != GGML_MAGIC && &magic != GGUF_MAGIC {
        bail!(
            "The model file {} does not start with the GGML or GGUF magic ({:02x?}), so it is corrupt or not a model",
            path.display(),
            magic
        );
    }
    Ok(())
}

/// Everything we can check once the bytes are on disk: the catalog size, the model magic and the
/// catalog hash. Called before the file is renamed into place, and again on a `.part` left behind
/// by a run that downloaded successfully but could not publish.
fn verify_finished_download(partial: &Path, destination: &Path, integrity: &DownloadIntegrity) -> Result<()> {
    let size = std::fs::metadata(partial)
        .context(format!("Failed to read the size of {}", partial.display()))?
        .len();
    if size == 0 {
        bail!("The download of {} is empty", destination.display());
    }
    if let Some(expected) = integrity.size {
        if size != expected {
            bail!("Incomplete download: expected {} bytes, the file holds {}", expected, size);
        }
    }
    if is_model_path(destination) {
        validate_model_file(partial)?;
    }
    if let Some(expected) = &integrity.sha256 {
        let actual = sha256_file(partial)?;
        if !actual.eq_ignore_ascii_case(expected) {
            bail!("Corrupt download: expected sha256 {}, got {}", expected, actual);
        }
    }
    Ok(())
}

fn try_publish(partial: &Path, destination: &Path) -> Result<()> {
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

/// Swap the finished `.part` in, retrying while the destination is locked. On Windows antivirus or
/// a running sona can hold the old model open for a moment; the caller keeps the `.part` when this
/// still fails, so the next attempt publishes it instead of downloading the file again.
fn publish_download(partial: &Path, destination: &Path) -> Result<()> {
    let mut attempt = 1;
    loop {
        match try_publish(partial, destination) {
            Ok(()) => return Ok(()),
            Err(error) if attempt < PUBLISH_ATTEMPTS => {
                tracing::warn!("publish attempt {attempt} for {} failed: {error:?}", destination.display());
                attempt += 1;
                std::thread::sleep(PUBLISH_RETRY_DELAY);
            }
            Err(error) => return Err(error),
        }
    }
}

async fn download_to_partial(
    app_handle: &tauri::AppHandle,
    url: &str,
    destination: &Path,
    integrity: &DownloadIntegrity,
    show_system_progress: bool,
) -> Result<DownloadOutcome> {
    let partial = partial_path(destination);

    // A previous run may have finished and verified the download but failed to swap it in. Those
    // bytes are still good, so try publishing them before spending another download.
    if partial.exists() {
        match verify_finished_download(&partial, destination, integrity) {
            Ok(()) => {
                tracing::info!("publishing the leftover download of {}", destination.display());
                publish_download(&partial, destination)?;
                return Ok(DownloadOutcome::Completed);
            }
            Err(error) => {
                tracing::warn!("discarding the leftover download of {}: {error:?}", destination.display());
                remove_if_exists(&partial)?;
            }
        }
    }

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
        let content_length = response.content_length().filter(|length| *length > 0);
        let total_size = content_length.unwrap_or(0);
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

        match content_length {
            Some(expected) if downloaded != expected => {
                bail!("Incomplete download: expected {} bytes, received {}", expected, downloaded);
            }
            Some(_) => {}
            // Chunked and gzipped responses arrive without a length, so a stream that ends cleanly
            // proves nothing about the bytes. Such a download counts as unverified and only the
            // content checks below decide whether it becomes a model file.
            None => tracing::warn!("no Content-Length for {url}, falling back to content verification"),
        }

        file.flush().context(format!("Failed to flush file {}", partial.display()))?;
        // Without the fsync a crash right after the rename can leave a zero-length or sparse file
        // behind, which then looks like an installed model.
        file.sync_all()
            .context(format!("Failed to flush file {} to disk", partial.display()))?;
        drop(file);
        verify_finished_download(&partial, destination, integrity)?;
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

    match result {
        Ok(DownloadOutcome::Completed) => {}
        other => {
            // Cancelled, failed or unverifiable: the bytes are worthless, drop them.
            remove_if_exists(&partial).log_error();
            return other;
        }
    }

    // From here the file is complete and verified, so a failure can only be a locked destination.
    // Leave the `.part` in place for the next attempt rather than throwing the download away.
    publish_download(&partial, destination)?;
    Ok(DownloadOutcome::Completed)
}

#[tauri::command]
pub async fn download_model(
    app_handle: tauri::AppHandle,
    url: String,
    path: String,
    integrity: Option<DownloadIntegrity>,
) -> Result<DownloadModelResult> {
    tracing::debug!("Download model invoked! with path {}", path);

    let integrity = integrity.unwrap_or_default();
    match download_to_partial(&app_handle, &url, Path::new(&path), &integrity, true).await? {
        DownloadOutcome::Completed => Ok(DownloadModelResult::Completed { path }),
        DownloadOutcome::Cancelled => Ok(DownloadModelResult::Cancelled),
    }
}

#[tauri::command]
pub async fn download_file(app_handle: tauri::AppHandle, url: String, path: String) -> Result<()> {
    tracing::debug!("Download file invoked! with path {}", path);

    match download_to_partial(&app_handle, &url, Path::new(&path), &DownloadIntegrity::default(), false).await? {
        DownloadOutcome::Completed => Ok(()),
        DownloadOutcome::Cancelled => bail!("Download cancelled"),
    }
}

/// Validate model files that are already installed. Legacy downloads (before the `.part` scheme)
/// wrote straight to the final name, so a truncated file from back then is still sitting in the
/// models folder looking perfectly installed.
#[tauri::command]
pub fn check_model_files(paths: Vec<String>) -> Vec<ModelFileCheck> {
    paths
        .into_iter()
        .map(|path| {
            let size = std::fs::metadata(&path).map(|metadata| metadata.len()).unwrap_or(0);
            match validate_model_file(Path::new(&path)) {
                Ok(()) => ModelFileCheck {
                    path,
                    valid: true,
                    size,
                    reason: None,
                },
                Err(error) => ModelFileCheck {
                    path,
                    valid: false,
                    size,
                    reason: Some(error.to_string()),
                },
            }
        })
        .collect()
}

/// Delete leftover `*.part` files in the models folder. Partial downloads cannot be resumed, and a
/// stale one only wastes disk space — except the one the caller is about to publish, which
/// `download_to_partial` handles before this ever runs.
#[tauri::command]
pub fn cleanup_partial_downloads(folder: String) -> Result<Vec<String>> {
    let mut removed = Vec::new();
    let entries = match std::fs::read_dir(&folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(removed),
        Err(error) => return Err(error).context(format!("Failed to read the models folder {folder}")),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("part") {
            continue;
        }
        match std::fs::remove_file(&path) {
            Ok(()) => removed.push(path.to_string_lossy().to_string()),
            Err(error) => tracing::warn!("failed to remove the stale download {}: {error}", path.display()),
        }
    }

    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::{
        check_model_files, cleanup_partial_downloads, partial_path, publish_download, remove_if_exists, validate_model_file,
        verify_finished_download, DownloadIntegrity, MIN_MODEL_SIZE,
    };
    use std::{fs, path::Path, path::PathBuf, time::SystemTime};

    fn test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("vibe-download-{name}-{}-{unique}", std::process::id()))
    }

    fn write_model(path: &Path, magic: &[u8; 4]) {
        let mut bytes = magic.to_vec();
        bytes.resize(MIN_MODEL_SIZE as usize + 16, 0);
        fs::write(path, bytes).unwrap();
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

    #[test]
    fn validate_model_file_accepts_ggml_and_gguf_and_rejects_truncated_files() {
        let dir = test_dir("validate");
        fs::create_dir_all(&dir).unwrap();

        let ggml = dir.join("ggml-model.bin");
        write_model(&ggml, b"lmgg");
        validate_model_file(&ggml).unwrap();

        let gguf = dir.join("model.gguf");
        write_model(&gguf, b"GGUF");
        validate_model_file(&gguf).unwrap();

        let html = dir.join("error.bin");
        write_model(&html, b"<htm");
        assert!(validate_model_file(&html).is_err());

        let truncated = dir.join("truncated.bin");
        fs::write(&truncated, b"lmgg").unwrap();
        assert!(validate_model_file(&truncated).is_err());

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn verify_finished_download_checks_size_and_hash_when_the_catalog_provides_them() {
        let dir = test_dir("verify");
        fs::create_dir_all(&dir).unwrap();
        let destination = dir.join("ggml-model.bin");
        let partial = partial_path(&destination);
        write_model(&partial, b"lmgg");
        let size = fs::metadata(&partial).unwrap().len();

        verify_finished_download(&partial, &destination, &DownloadIntegrity::default()).unwrap();
        verify_finished_download(
            &partial,
            &destination,
            &DownloadIntegrity {
                size: Some(size),
                sha256: None,
            },
        )
        .unwrap();
        assert!(verify_finished_download(
            &partial,
            &destination,
            &DownloadIntegrity {
                size: Some(size + 1),
                sha256: None,
            },
        )
        .is_err());
        assert!(verify_finished_download(
            &partial,
            &destination,
            &DownloadIntegrity {
                size: None,
                sha256: Some("00".repeat(32)),
            },
        )
        .is_err());

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn check_model_files_reports_a_reason_for_corrupt_files() {
        let dir = test_dir("check");
        fs::create_dir_all(&dir).unwrap();
        let good = dir.join("ggml-good.bin");
        let bad = dir.join("ggml-bad.bin");
        write_model(&good, b"lmgg");
        fs::write(&bad, b"").unwrap();

        let checks = check_model_files(vec![good.to_string_lossy().to_string(), bad.to_string_lossy().to_string()]);

        assert!(checks[0].valid);
        assert!(!checks[1].valid);
        assert!(checks[1].reason.is_some());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn cleanup_partial_downloads_removes_only_leftover_parts() {
        let dir = test_dir("sweep");
        fs::create_dir_all(&dir).unwrap();
        let model = dir.join("ggml-model.bin");
        let leftover = dir.join("ggml-model.bin.part");
        write_model(&model, b"lmgg");
        fs::write(&leftover, b"half").unwrap();

        let removed = cleanup_partial_downloads(dir.to_string_lossy().to_string()).unwrap();

        assert_eq!(removed.len(), 1);
        assert!(model.exists());
        assert!(!leftover.exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
