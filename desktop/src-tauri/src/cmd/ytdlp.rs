use eyre::{bail, Context, Result};
use tauri::{AppHandle, Manager};

use super::get_ffmpeg_path;

fn get_binary_name() -> &'static str {
    if cfg!(windows) {
        "yt-dlp.exe"
    } else if cfg!(target_os = "linux") {
        "yt-dlp_linux"
    } else {
        "yt-dlp_macos"
    }
}

#[tauri::command]
pub fn get_temp_path(app_handle: AppHandle, ext: String, in_documents: Option<bool>) -> String {
    let mut base_path = if in_documents.unwrap_or_default() {
        app_handle.path().document_dir().unwrap()
    } else {
        std::env::temp_dir()
    };

    base_path.push(format!("{}.{}", crate::utils::get_local_time(), ext));
    base_path.to_string_lossy().to_string()
}

#[tauri::command]
pub async fn download_audio(app_handle: AppHandle, url: String, out_path: String) -> Result<String> {
    tracing::debug!("download audio {}", url);
    let name = get_binary_name();
    let path = app_handle.path().app_local_data_dir().context("Can't get data directory")?;
    let path = path.join(name);
    tracing::debug!("path is {}", path.display());
    let ffmpeg_path = get_ffmpeg_path();

    // Set permission
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let meta = std::fs::metadata(path.clone())?;
        let mut perm = meta.permissions();
        // chmod +x
        perm.set_mode(0o755);
        std::fs::set_permissions(path.clone(), perm)?;
    }

    let output = std::process::Command::new(path)
        .args([
            "--no-playlist",
            "-x",
            "--audio-format",
            "m4a",
            "--ffmpeg-location",
            &ffmpeg_path,
            &url,
            "-o",
            &out_path,
        ])
        .output()?;
    if !output.status.success() {
        let stderr = String::from_utf8(output.stderr)?;
        bail!("Failed to download audio: {}", stderr);
    }
    let output = String::from_utf8(output.stdout)?;
    Ok(output)
}
