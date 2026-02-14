use crate::audio_utils::get_vibe_temp_folder;
use eyre::{bail, Context, ContextCompat, Result};
use serde_json::Value;
use std::{
    io::{BufRead, BufReader},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::utils::LogError;

use super::get_ffmpeg_path;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Stdio;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn get_binary_name() -> &'static str {
    if cfg!(windows) {
        if cfg!(target_arch = "aarch64") {
            "yt-dlp_arm64.exe"
        } else {
            "yt-dlp.exe"
        }
    } else if cfg!(target_os = "linux") {
        if cfg!(target_arch = "aarch64") {
            "yt-dlp_linux_aarch64"
        } else {
            "yt-dlp_linux"
        }
    } else {
        "yt-dlp_macos"
    }
}

#[tauri::command]
pub async fn get_latest_ytdlp_version() -> Result<String> {
    let client = reqwest::Client::builder().user_agent("vibe-app").build()?;
    let resp = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .send()
        .await?
        .error_for_status()?;
    let json: Value = resp.json().await?;
    let tag = json["tag_name"]
        .as_str()
        .context("missing tag_name in latest release response")?
        .to_string();
    Ok(tag)
}

#[tauri::command]
pub fn get_temp_path(app_handle: AppHandle, ext: String, in_documents: Option<bool>) -> String {
    let mut base_path = if in_documents.unwrap_or_default() {
        app_handle.path().document_dir().unwrap_or(get_vibe_temp_folder())
    } else {
        get_vibe_temp_folder()
    };

    base_path.push(format!("{}.{}", crate::utils::get_local_time(), ext));
    base_path.to_string_lossy().to_string()
}

#[tauri::command]
pub async fn download_audio(app_handle: AppHandle, url: String, out_path: String) -> Result<()> {
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

    let mut cmd = std::process::Command::new(path);
    let cmd = cmd
        .args([
            "--progress-template",
            "{\"progress\": \"%(progress.percent)s\", \"total_bytes\": \"%(progress.total_bytes)s\", \"progress_str\": \"%(progress._percent_str)s\"}\n",
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
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    let cmd = cmd.creation_flags(CREATE_NO_WINDOW);

    let cancel_flag = std::sync::Arc::new(AtomicBool::new(false));
    let cancel_flag_c = cancel_flag.clone();
    app_handle.once("ytdlp-cancel", move |_| {
        cancel_flag_c.store(true, Ordering::Relaxed);
    });

    let mut child = cmd.spawn()?;

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            if cancel_flag.load(Ordering::Relaxed) {
                let _ = child.kill();
                break;
            }

            let mut line = line?;
            line = line.replace("\r", "").trim().to_string();

            if line.starts_with("{\"progress") {
                // try parse progress
                let result: Result<Value, _> = serde_json::from_str(&line);
                if let Ok(value) = result {
                    // remove % and parse to number
                    let percentage_str = value["progress_str"].as_str().unwrap_or_default().trim().replace("%", "");
                    if let Ok(percentage_number) = percentage_str.parse::<f32>() {
                        app_handle
                            .emit("ytdlp-progress", percentage_number)
                            .context("failed to emit")
                            .log_error();
                    }
                }
            }
        }
    }

    let ret = child.wait()?;
    if !ret.success() && !cancel_flag.load(Ordering::Relaxed) {
        let mut stderr_output: String = "".to_string();
        if let Some(stderr) = child.stderr.take() {
            stderr_output = BufReader::new(stderr)
                .lines()
                .map_while(Result::ok)
                .collect::<Vec<_>>()
                .join("\n");
            eprintln!("Error: {}", stderr_output);
        }
        bail!("Failed to download audio: {}", stderr_output);
    }
    Ok(())
}
