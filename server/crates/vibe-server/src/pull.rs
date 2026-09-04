use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

pub async fn pull_file(raw_url: &str, output_path: Option<&str>) -> anyhow::Result<()> {
    let response = reqwest::get(raw_url).await?;
    if !response.status().is_success() {
        anyhow::bail!("download failed: HTTP {}", response.status());
    }

    let filename = resolve_filename(&response, raw_url);
    let dst = resolve_output_path(output_path, &filename);
    if let Some(parent) = dst.parent().filter(|parent| !parent.as_os_str().is_empty()) {
        tokio::fs::create_dir_all(parent).await?;
    }

    let tmp = PathBuf::from(format!("{}.part", dst.display()));
    let mut file = tokio::fs::File::create(&tmp).await?;
    let total = response.content_length();
    let mut written = 0u64;
    let start = Instant::now();
    let mut last_print = Instant::now() - Duration::from_secs(1);
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        written += chunk.len() as u64;
        if last_print.elapsed() >= Duration::from_millis(200) {
            print_progress(written, total, start);
            last_print = Instant::now();
        }
    }
    file.flush().await?;
    drop(file);
    tokio::fs::rename(&tmp, &dst).await?;
    print_progress(written, total, start);
    println!("\nsaved {}", dst.display());
    Ok(())
}

fn resolve_filename(response: &reqwest::Response, raw_url: &str) -> String {
    if let Some(disposition) = response.headers().get(reqwest::header::CONTENT_DISPOSITION) {
        if let Ok(disposition) = disposition.to_str() {
            for part in disposition.split(';').map(str::trim) {
                if let Some(filename) = part.strip_prefix("filename=") {
                    let filename = filename.trim_matches('"');
                    if !filename.is_empty() {
                        return Path::new(filename)
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into_owned();
                    }
                }
            }
        }
    }

    raw_url
        .split('?')
        .next()
        .and_then(|url| url.rsplit('/').next())
        .filter(|name| !name.is_empty())
        .unwrap_or("model.bin")
        .to_string()
}

fn resolve_output_path(output_path: Option<&str>, filename: &str) -> PathBuf {
    match output_path {
        None | Some("") | Some(".") => PathBuf::from(filename),
        Some(path) if path.ends_with('/') || path.ends_with('\\') => PathBuf::from(path).join(filename),
        Some(path) => {
            let path = PathBuf::from(path);
            if path.is_dir() {
                path.join(filename)
            } else {
                path
            }
        }
    }
}

fn print_progress(written: u64, total: Option<u64>, start: Instant) {
    let mb = written as f64 / (1024.0 * 1024.0);
    let seconds = start.elapsed().as_secs_f64().max(0.001);
    let speed = mb / seconds;
    if let Some(total) = total {
        let total_mb = total as f64 / (1024.0 * 1024.0);
        let pct = written as f64 * 100.0 / total as f64;
        let remaining_mb = total_mb - mb;
        let eta = if speed > 0.0 { remaining_mb / speed } else { 0.0 };
        print!("\rdownloading {pct:.1}% ({mb:.1}/{total_mb:.1} MB) {speed:.2} MB/s eta {eta:.0}s");
    } else {
        print!("\rdownloading {mb:.1} MB {speed:.2} MB/s");
    }
}

