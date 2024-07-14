use eyre::{bail, Context, OptionExt, Result};
use futures_util::StreamExt;
use reqwest;
use std::clone::Clone;
use std::io::Write;
use std::path::PathBuf;

pub struct Downloader {
    client: reqwest::Client,
}

pub async fn get_filename(url: &str) -> Result<String> {
    let client = reqwest::Client::new();

    let response = client.head(url).send().await?;

    if let Some(content_disposition) = response.headers().get("Content-Disposition") {
        let content_disposition = content_disposition.to_str();
        if let Ok(content_disposition) = content_disposition {
            let parts: Vec<&str> = content_disposition.split(';').collect();
            for part in parts {
                let part = part.trim();
                if part.starts_with("filename=") {
                    let filename = part.trim_start_matches("filename=").trim_matches('"');
                    return Ok(filename.to_string());
                }
            }
        }
    }

    bail!("Filename not found in headers")
}

impl Downloader {
    pub fn new() -> Self {
        let client = reqwest::Client::new();

        Downloader { client }
    }

    pub async fn download<F>(&mut self, url: &str, path: PathBuf, on_progress: F) -> Result<()>
    where
        F: Fn(u64, u64) -> bool,
    {
        let res = self.client.get(url).send().await?;
        let total_size = res
            .content_length()
            .ok_or_eyre(format!("Failed to get content length from '{}'", url))?;
        let mut file = std::fs::File::create(path.clone()).context(format!("Failed to create file {}", path.display()))?;
        let mut downloaded: u64 = 0;
        let callback_limit = 1024 * 1024 * 2; // 1MB limit
        let mut callback_offset = 0;
        let mut stream = res.bytes_stream();
        while let Some(item) = stream.next().await {
            let chunk = item.context("Error while downloading file")?;
            file.write_all(&chunk)
                .context(format!("Error while writing to file {}", path.display()))?;
            // Check if downloaded size is a multiple of 10MB
            if downloaded > callback_offset + callback_limit {
                let is_abort_set = on_progress(downloaded, total_size);
                if is_abort_set {
                    break;
                }

                callback_offset = downloaded;
            }
            downloaded += chunk.len() as u64;
        }
        Ok(())
    }
}

impl Default for Downloader {
    fn default() -> Self {
        Self::new()
    }
}
