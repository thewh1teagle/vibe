mod cli;
mod tasks;
mod tools;

use anyhow::Result;
use clap::Parser;

use crate::cli::{Cli, Command};

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::FetchHeaders => tasks::fetch_headers::run(),
        Command::FetchLibs => tasks::fetch_libs::run(),
        Command::BuildLibs(args) => tasks::build_libs::run(args),
        Command::PackageRelease(args) => tasks::package_release::run(args),
    }
}
