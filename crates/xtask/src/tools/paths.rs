use std::path::PathBuf;

use anyhow::{Context, Result};

pub fn repo_root() -> Result<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .and_then(|path| path.parent())
        .map(PathBuf::from)
        .context("failed to resolve workspace root")
}

pub fn whisper_commit() -> Result<String> {
    let path = repo_root()?.join(".whispercpp-commit");
    let commit = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?
        .trim()
        .to_string();
    anyhow::ensure!(!commit.is_empty(), "{} is empty", path.display());
    Ok(commit)
}

pub fn platform_id() -> String {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        os => os,
    };
    let arch = match (os, std::env::consts::ARCH) {
        ("windows", "x86_64") => "amd64",
        ("darwin", "aarch64") => "arm64",
        (_, arch) => arch,
    };
    format!("{os}-{arch}")
}
