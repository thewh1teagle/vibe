use crate::ffmpeg::get_vibe_temp_folder;
use eyre::{eyre, Context, ContextCompat, Result};
use serde_json::Value;
use std::{
    io::{BufRead, BufReader},
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::error::LogError;

use super::download::{download_client, download_to_partial, DownloadIntegrity, DownloadOutcome};
use super::files::get_ffmpeg_path;

use crate::error::CommandResult;
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
pub async fn get_latest_ytdlp_version() -> CommandResult<String> {
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
pub fn get_temp_path(ext: String) -> String {
    let mut base_path = get_vibe_temp_folder();
    let extension = ext.trim_start_matches('.');
    let extension =
        if !extension.is_empty() && extension.len() <= 10 && extension.chars().all(|character| character.is_ascii_alphanumeric())
        {
            extension.to_ascii_lowercase()
        } else {
            "m4a".to_string()
        };

    base_path.push(format!(
        "{}-{}.{}",
        crate::ffmpeg::get_local_time(),
        crate::ffmpeg::random_string(10),
        extension
    ));
    base_path.to_string_lossy().to_string()
}

/// Only a plain http(s) link may reach yt-dlp. Anything else — `--exec=...`, `-a file`, `file://` —
/// would be read as an option or a local resource. Returns the normalized URL.
fn validate_media_url(url: &str) -> Result<String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| eyre!("Not a valid http or https link: {url}"))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none_or(str::is_empty) {
        return Err(eyre!("Not a valid http or https link: {url}"));
    }
    Ok(parsed.to_string())
}

/// yt-dlp writes wherever `-o` says, so the output must be a file directly in the staging folder.
fn validate_out_path(out_path: &str, staging: &Path) -> Result<PathBuf> {
    let path = Path::new(out_path);
    if !path.is_absolute() || path.components().any(|component| matches!(component, Component::ParentDir)) {
        return Err(eyre!("Download path {out_path} is not inside the staging folder"));
    }
    let file_name = path.file_name().context("Download path has no file name")?;
    let parent = path.parent().context("Download path has no parent folder")?;
    let parent = std::fs::canonicalize(parent).context(format!("Failed to resolve {}", parent.display()))?;
    let staging = std::fs::canonicalize(staging).context("Failed to resolve the staging folder")?;
    if parent != staging {
        return Err(eyre!("Download path {out_path} is not inside the staging folder"));
    }
    Ok(parent.join(file_name))
}

/// yt-dlp release tags are dates, `2025.01.15`, sometimes with one more numeric segment.
fn validate_version_tag(version: &str) -> Result<()> {
    let parts: Vec<&str> = version.split('.').collect();
    let digits =
        |part: &str, min: usize, max: usize| (min..=max).contains(&part.len()) && part.bytes().all(|byte| byte.is_ascii_digit());
    let valid = matches!(parts.len(), 3 | 4)
        && digits(parts[0], 4, 4)
        && digits(parts[1], 2, 2)
        && digits(parts[2], 2, 2)
        && parts.get(3).is_none_or(|extra| digits(extra, 1, 10));
    if !valid {
        return Err(eyre!("Invalid yt-dlp version: {version}"));
    }
    Ok(())
}

/// Finds the hash for `asset` in a release's `SHA2-256SUMS` (`<hex>  <name>` per line, `sha256sum`
/// format). Missing or conflicting entries are an error: the binary is never installed unverified.
fn parse_sha256_sums(sums: &str, asset: &str) -> Result<String> {
    let mut found: Option<String> = None;
    for line in sums.lines() {
        let mut fields = line.split_whitespace();
        let (Some(hash), Some(name), None) = (fields.next(), fields.next(), fields.next()) else {
            continue;
        };
        if name.trim_start_matches('*') != asset {
            continue;
        }
        if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(eyre!("Malformed checksum for {asset} in SHA2-256SUMS"));
        }
        let hash = hash.to_ascii_lowercase();
        if found.as_ref().is_some_and(|previous| *previous != hash) {
            return Err(eyre!("Conflicting checksums for {asset} in SHA2-256SUMS"));
        }
        found = Some(hash);
    }
    found.ok_or_else(|| eyre!("No checksum for {asset} in SHA2-256SUMS"))
}

/// Install the given yt-dlp release into the app data folder. The URL, asset and destination are
/// fixed here; the webview only picks the tag. The binary is checked against the release's own
/// `SHA2-256SUMS` before it replaces the installed one.
#[tauri::command]
pub async fn download_ytdlp(app_handle: AppHandle, version: String) -> CommandResult<()> {
    validate_version_tag(&version)?;
    let asset = get_binary_name();
    let base = format!("https://github.com/yt-dlp/yt-dlp/releases/download/{version}");

    let sums = download_client()?
        .get(format!("{base}/SHA2-256SUMS"))
        .send()
        .await?
        .error_for_status()
        .context("Failed to download SHA2-256SUMS for yt-dlp")?
        .text()
        .await?;
    let sha256 = parse_sha256_sums(&sums, asset)?;

    let folder = app_handle.path().app_local_data_dir().context("Can't get data directory")?;
    std::fs::create_dir_all(&folder).context("Failed to create the data directory")?;
    let integrity = DownloadIntegrity {
        size: None,
        sha256: Some(sha256),
    };
    match download_to_partial(
        &app_handle,
        &format!("{base}/{asset}"),
        &folder.join(asset),
        &integrity,
        false,
    )
    .await?
    {
        DownloadOutcome::Completed => Ok(()),
        DownloadOutcome::Cancelled => Err(eyre!("Download cancelled").into()),
    }
}

#[tauri::command]
pub async fn download_audio(app_handle: AppHandle, url: String, out_path: String) -> CommandResult<()> {
    tracing::debug!("download audio {}", url);
    let url = validate_media_url(&url)?;
    let out_path = validate_out_path(&out_path, &get_vibe_temp_folder())?;
    let out_path = out_path.to_string_lossy().to_string();
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
            "--no-update",
            "--ignore-config",
            "-x",
            "--audio-format",
            "m4a",
            "--ffmpeg-location",
            &ffmpeg_path,
            "-o",
            &out_path,
            // Everything after `--` is a URL, never an option.
            "--",
            &url,
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

        // yt-dlp can print bytes that are not UTF-8 (a title in the platform's code page on
        // Windows), and `lines()` would abort the whole download on the first one.
        for line in reader.split(b'\n') {
            if cancel_flag.load(Ordering::Relaxed) {
                let _ = child.kill();
                break;
            }

            let mut line = String::from_utf8_lossy(&line?).into_owned();
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
                .split(b'\n')
                .map_while(Result::ok)
                .map(|line| String::from_utf8_lossy(&line).into_owned())
                .collect::<Vec<_>>()
                .join("\n");
            eprintln!("Error: {}", stderr_output);
        }
        return Err(eyre!("Failed to download audio: {}", stderr_output).into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn download_paths_are_always_staged_in_vibe_temp() {
        let path = PathBuf::from(get_temp_path("m4a".to_string()));

        assert_eq!(path.parent(), Some(get_vibe_temp_folder().as_path()));
        assert_eq!(path.extension().and_then(|ext| ext.to_str()), Some("m4a"));
    }

    #[test]
    fn concurrent_downloads_receive_distinct_safe_paths() {
        let first = get_temp_path("../wav".to_string());
        let second = get_temp_path("../wav".to_string());

        assert_ne!(first, second);
        assert_eq!(PathBuf::from(first).extension().and_then(|ext| ext.to_str()), Some("m4a"));
    }

    #[test]
    fn media_urls_must_be_http_or_https() {
        assert!(validate_media_url("http://example.com/watch?v=1").is_ok());
        assert!(validate_media_url("https://www.youtube.com/watch?v=abc").is_ok());
        for bad in [
            "--exec=touch /tmp/x",
            "-a",
            "file:///etc/passwd",
            "",
            "ftp://example.com/a",
            "https://",
            "example.com",
        ] {
            assert!(validate_media_url(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn out_path_must_sit_directly_in_the_staging_folder() {
        let staging = get_vibe_temp_folder();
        assert!(validate_out_path(&get_temp_path("m4a".to_string()), &staging).is_ok());
        let escape = staging.join("..").join("evil.m4a");
        assert!(validate_out_path(&escape.to_string_lossy(), &staging).is_err());
        let elsewhere = std::env::current_dir().unwrap().join("evil.m4a");
        assert!(validate_out_path(&elsewhere.to_string_lossy(), &staging).is_err());
        assert!(validate_out_path("evil.m4a", &staging).is_err());
        assert!(validate_out_path("", &staging).is_err());
    }

    #[test]
    fn version_tags_are_strict_dates() {
        for good in ["2025.01.15", "2026.08.19", "2025.01.15.232714"] {
            assert!(validate_version_tag(good).is_ok(), "{good} should be accepted");
        }
        for bad in [
            "",
            "latest",
            "2025.1.15",
            "2025.01.15.",
            "../2025.01.15",
            "2025.01.15/../x",
            "2025.01.15.1.2",
            "v2025.01.15",
        ] {
            assert!(validate_version_tag(bad).is_err(), "{bad} should be rejected");
        }
    }

    // Excerpt of the real SHA2-256SUMS from the 2026.08.19 release.
    const SUMS: &str = "1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6  yt-dlp
66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a  yt-dlp.exe
05b438997bafc3affdfda9d041353c9d73e04dc842207254b655b0887c4445b0  yt-dlp_arm64.exe
58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a  yt-dlp_linux
b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc  yt-dlp_linux_aarch64
0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202  yt-dlp_macos
07e54b0865303c864006925913bce2604f8ee8cc6f18699bac9c309f9328a6d8  yt-dlp_macos.zip
";

    #[test]
    fn sha256_sums_find_the_exact_asset() {
        assert_eq!(
            parse_sha256_sums(SUMS, "yt-dlp_macos").unwrap(),
            "0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202"
        );
        assert_eq!(
            parse_sha256_sums(SUMS, "yt-dlp.exe").unwrap(),
            "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a"
        );
        assert!(parse_sha256_sums(SUMS, get_binary_name()).is_ok());
        assert!(parse_sha256_sums(SUMS, "yt-dlp_musllinux").is_err());
        assert!(parse_sha256_sums("", "yt-dlp_macos").is_err());
        assert!(parse_sha256_sums("<html>Not Found</html>", "yt-dlp_macos").is_err());
        assert_eq!(
            parse_sha256_sums(&format!("{} *yt-dlp_macos", "AB".repeat(32)), "yt-dlp_macos").unwrap(),
            "ab".repeat(32)
        );
        assert!(parse_sha256_sums("abc  yt-dlp_macos", "yt-dlp_macos").is_err());
        let conflicting = format!("{}  yt-dlp_macos\n{}  yt-dlp_macos", "a".repeat(64), "b".repeat(64));
        assert!(parse_sha256_sums(&conflicting, "yt-dlp_macos").is_err());
    }
}
