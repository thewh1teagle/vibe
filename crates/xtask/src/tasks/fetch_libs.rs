use anyhow::Result;

use crate::tools::{archives, download, paths};

const GITHUB_REPO: &str = "vibe-transcribe/sona";

pub fn run() -> Result<()> {
    let root = paths::repo_root()?;
    let commit = paths::whisper_commit()?;
    let platform = paths::platform_id();
    let tag = format!("libraries-{}", &commit[..7]);
    let filename = format!("whisper-libs-{platform}.tar.gz");
    let url = format!("https://github.com/{GITHUB_REPO}/releases/download/{tag}/{filename}");

    println!("commit: {commit}");
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
