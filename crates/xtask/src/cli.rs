use std::path::PathBuf;

use clap::{Args, Parser, Subcommand, ValueEnum};

#[derive(Debug, Parser)]
#[command(author, version, about = "Sona development tasks")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Fetch whisper.cpp headers into third_party/include.
    FetchHeaders,
    /// Download prebuilt whisper.cpp static libraries for this platform.
    FetchLibs,
    /// Build whisper.cpp static libraries for this platform.
    BuildLibs(BuildLibsArgs),
    /// Package a Sona release archive with ffmpeg.
    PackageRelease(PackageReleaseArgs),
}

#[derive(Debug, Args)]
pub struct BuildLibsArgs {
    /// Upload the archive to the GitHub release derived from the whisper.cpp commit.
    #[arg(long)]
    pub upload: bool,
}

#[derive(Debug, Args)]
pub struct PackageReleaseArgs {
    /// Built sona binary path.
    #[arg(long)]
    pub binary: PathBuf,
    /// Target OS.
    #[arg(long)]
    pub goos: TargetOs,
    /// Target architecture.
    #[arg(long)]
    pub goarch: TargetArch,
    /// Output archive path.
    #[arg(long)]
    pub out: PathBuf,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum TargetOs {
    Darwin,
    Windows,
}

impl TargetOs {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Darwin => "darwin",
            Self::Windows => "windows",
        }
    }
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum TargetArch {
    Amd64,
    Arm64,
}

impl TargetArch {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Amd64 => "amd64",
            Self::Arm64 => "arm64",
        }
    }
}
