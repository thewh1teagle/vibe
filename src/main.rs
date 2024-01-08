mod args;
mod audio;
mod config;
mod downloader;
mod model;
use anyhow::Result;
use args::Args;
use clap::Parser;
use env_logger;

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();
    let args = Args::parse();
    let mut downloader = downloader::Downloader::new();
    downloader
        .download(config::URL, config::get_model_path()?, Some(config::HASH))
        .await?;
    model::transcribe(args)?;
    Ok(())
}
