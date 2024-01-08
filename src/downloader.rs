use std::path::PathBuf;
use crate::config;
use indicatif;
use reqwest::{self, Request};
use anyhow::{Result, Context, Ok, bail};
use indicatif::{ProgressBar, ProgressStyle};
use futures_util::StreamExt;
use std::io::Write;
use std::clone::Clone;
use env_logger;
use log::debug;
use sha256::{digest, try_digest};
// https://huggingface.co/ggerganov/whisper.cpp/tree/main


struct Downloader {
    client: reqwest::Client
}

impl Downloader {
    fn new() -> Self {
        let client = reqwest::Client::new();
        
        Downloader { client }
    }


    async fn download(&mut self, url: &str, path: PathBuf, hash: Option<&str>) -> Result<()> {
        if path.exists() {
            debug!("file {} exists!", path.display());
            return Ok(());
        }
        let res = self.client.get(url)
            .send()
            .await?;
        let total_size = res
            .content_length()
            .context(format!("Failed to get content length from '{}'", url))?;
        let pb = ProgressBar::new(total_size);
        pb.set_style(ProgressStyle::default_bar()
            .template("{msg}\n{spinner:.green} [{elapsed_precise}] [{wide_bar:.cyan/blue}] {bytes}/{total_bytes} ({bytes_per_sec}, {eta})")?
            .progress_chars("#>-"));
        pb.set_message(format!("Downloading {} to {}", url, path.display()));
        let mut file = std::fs::File::create(path.clone()).context(format!("Failed to create file {}", path.display()))?;
        let mut downloaded: u64 = 0;
        let mut stream = res.bytes_stream();
        while let Some(item) = stream.next().await {
            let chunk = item.context("Error while downloading file")?;
            file.write_all(&chunk)
                .context(format!("Error while writing to file {}", path.display()))?;
            let new = std::cmp::min(downloaded + (chunk.len() as u64), total_size);
            downloaded = new;
            pb.set_position(new);
        }
        pb.finish_with_message(format!("Downloaded {} to {}", url, path.display()));
        Ok(())
    }

    async fn _verify(path: &PathBuf, hash: String) -> Result<()> { // TODO
        let val = try_digest(path).unwrap();
        if val != hash {
            bail!("Invalid file hash!");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use anyhow::{Context, Result};
    use app_dirs2::*;
    use crate::{downloader, config};

    fn init() {
        let _ = env_logger::builder().is_test(true).try_init();
    }

    #[tokio::test]
    async fn test_download() -> Result<()> {
        init();
        let mut d = downloader::Downloader::new();
        let app_config = app_root(AppDataType::UserData, &config::APP_INFO)?;
        let filepath = config::get_model_path()?;
        d.download(config::URL, filepath, Some(config::HASH)).await.context("Cant download")?;
        Ok(())
    }

}