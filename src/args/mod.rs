mod language;
use clap::{ArgAction, Parser};

use self::language::Language;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
pub struct Args {
    /// Path to file
    #[arg(short, long)]
    pub path: String,

    /// Path to output file
    #[arg(short, long)]
    pub output: Option<String>,

    /// Path to model
    #[arg(short, long)]
    pub model: Option<String>,

    /// Language spoken in the audio. Attempts to auto-detect by default.
    #[clap(short, long)]
    pub lang: Option<Language>,

    /// Verbose output
    #[arg(long, action=ArgAction::SetTrue, default_value_t = false)]
    pub verbose: bool,

    /// N threads for model
    #[arg(long)]
    pub n_threads: Option<i32>,
}
