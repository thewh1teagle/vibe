use anyhow::Result;
use clap::{ArgAction, Parser};
use env_logger;
use std::path::PathBuf;
use vibe;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
pub struct Args {
    /// Path to file
    #[arg(short, long)]
    pub path: String,

    /// Path to output file
    #[arg(short, long)]
    pub output: String,

    /// Path to model
    #[arg(short, long)]
    pub model: Option<String>,

    /// Language spoken in the audio. Attempts to auto-detect by default.
    #[clap(short, long)]
    pub lang: Option<vibe::language::Language>,

    /// Verbose output
    #[arg(long, action=ArgAction::SetTrue, default_value_t = false)]
    pub verbose: bool,

    /// N threads for model
    #[arg(long)]
    pub n_threads: Option<i32>,
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();
    let args = Args::parse();
    let mut downloader = vibe::downloader::Downloader::new();
    downloader
        .download(vibe::config::URL, vibe::config::get_model_path()?, Some(""))
        .await?;
    let args = vibe::config::ModelArgs {
        lang: args.lang.and_then(|a| Some(a.as_str().to_string())),
        model: vibe::config::get_model_path()?,
        path: PathBuf::from(args.path),
        n_threads: args.n_threads,
        verbose: args.verbose,
    };
    let text = vibe::model::transcribe(&args)?;
    println!("{}", text);
    Ok(())
}
