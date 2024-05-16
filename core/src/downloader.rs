use eyre::{Context, Ok, OptionExt, Result};
use futures_util::{Future, StreamExt};
use reqwest;
use std::clone::Clone;
use std::io::Write;
use std::path::PathBuf;

pub struct Downloader {
    client: reqwest::Client,
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

#[cfg(test)]
mod tests {
    use crate::{config, downloader};
    use eyre::{Context, Result};

    fn init() {
        let _ = env_logger::builder().is_test(true).try_init();
    }

    async fn on_download_progress(_: u64, _: u64) {}

    #[tokio::test]
    async fn test_download() -> Result<()> {
        init();
        let mut d = downloader::Downloader::new();
        let filepath = config::get_model_path()?;
        d.download(config::URL, filepath, on_download_progress)
            .await
            .context("Cant download")?;
        Ok(())
    }
}
