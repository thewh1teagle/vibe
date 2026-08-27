use anyhow::Result;

use crate::tools::{archives, download, paths};

const GITHUB_REPO: &str = "vibe-transcribe/sona";

pub fn run() -> Result<()> {
    let root = paths::repo_root()?;
    let version = paths::ggml_version()?;
    let platform = paths::platform_id();
    let tag = format!("libraries-ggml-{version}");
    let filename = format!("ggml-libs-{platform}.tar.gz");
    let url = format!("https://github.com/{GITHUB_REPO}/releases/download/{tag}/{filename}");

    println!("ggml: {version}");
    println!("platform: {platform}");
    let data = download::bytes(&url, 120)?;
    let out_dir = root.join("third_party");
    archives::extract_tar_gz(&data, &out_dir)?;
    println!(
        "extracted to {} ({} KB)",
        out_dir.display(),
        data.len() / 1024
    );
    Ok(())
}
