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

/// The pinned GGML release tag (e.g. "v0.22.0"), from `.ggml-version`.
pub fn ggml_version() -> Result<String> {
    let path = repo_root()?.join(".ggml-version");
    let version = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?
        .trim()
        .to_string();
    anyhow::ensure!(!version.is_empty(), "{} is empty", path.display());
    Ok(version)
}

pub fn platform_id() -> String {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        os => os,
    };
    let arch = match (os, std::env::consts::ARCH) {
        ("darwin", "aarch64") => "arm64",
        ("windows", "x86_64") => "amd64",
        (_, arch) => arch,
    };
    if os == "windows" {
        return format!("{os}-{arch}-{}", windows_lib_flavor());
    }
    format!("{os}-{arch}")
}

pub fn windows_lib_flavor() -> &'static str {
    match std::env::var("SONA_WINDOWS_LIB_FLAVOR").as_deref() {
        Ok("gnu") => "gnu",
        Ok("msvc") => "msvc",
        Ok(other) => panic!("unsupported SONA_WINDOWS_LIB_FLAVOR: {other}"),
        Err(_) if cfg!(target_env = "gnu") => "gnu",
        Err(_) => "msvc",
    }
}
