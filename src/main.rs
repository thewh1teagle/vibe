mod audio;
mod model;
mod downloader;
mod config;
use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser,ArgAction};
use env_logger;


#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
pub struct Args {
    /// Path to file
    #[arg(short, long)]
    path: String,

    /// Path to output file
    #[arg(short, long)]
    output: Option<String>,

    /// Path to model
    #[arg(short, long)]
    model: Option<String>,

    /// Path to model
    #[arg(short, long, default_value = "en")]
    language: Option<String>,

    /// Show language languages
    #[arg(short, long, action=ArgAction::SetTrue, default_value_t = false)]
    show_languages: bool,

    /// Verbose output
    #[arg(long, action=ArgAction::SetTrue, default_value_t = false)]
    verbose: bool,

    /// N threads for model
    #[arg(long)]
    n_threads: Option<i32>,
}

fn main() -> Result<()> {
    env_logger::init();
    let args = Args::parse();
    let model_path = if let Some(model) = args.model {
        PathBuf::from(model)
    } else {
        config::get_model_path()?.into()
    };

    let output_path: Option<PathBuf> = args.output.and_then(|output| Some(PathBuf::from(output)));

    model::transcribe(
        PathBuf::from(args.path),
        model_path,
        output_path,
        args.language.as_deref(),
        args.verbose,
        args.n_threads
        
    );
    Ok(())
}