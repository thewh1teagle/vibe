use anyhow::{Context, Result};

use crate::tools::{download, paths};

const WHISPER_REPO: &str = "ggml-org/whisper.cpp";
const HEADERS: &[&str] = &[
    "include/whisper.h",
    "ggml/include/ggml.h",
    "ggml/include/ggml-cpu.h",
    "ggml/include/ggml-alloc.h",
    "ggml/include/ggml-backend.h",
];

pub fn run() -> Result<()> {
    let root = paths::repo_root()?;
    let commit = paths::whisper_commit()?;
    let out_dir = root.join("third_party/include");
    std::fs::create_dir_all(&out_dir)?;
    let now = current_utc_stamp()?;

    for path in HEADERS {
        let name = std::path::Path::new(path)
            .file_name()
            .context("header path has no filename")?
            .to_string_lossy();
        let source = format!("https://github.com/{WHISPER_REPO}/blob/{commit}/{path}");
        let raw_url = format!("https://raw.githubusercontent.com/{WHISPER_REPO}/{commit}/{path}");
        let body = String::from_utf8(download::bytes(&raw_url, 120)?)?;
        let stamped =
            format!("// Fetched: {now}\n// Source: {source}\n// Commit: {commit}\n\n{body}");
        std::fs::write(out_dir.join(name.as_ref()), stamped)?;
        println!("wrote {name} (commit {commit})");
    }

    Ok(())
}

fn current_utc_stamp() -> Result<String> {
    let format =
        time::macros::format_description!("[year]-[month]-[day] [hour]:[minute]:[second] UTC");
    Ok(time::OffsetDateTime::now_utc().format(format)?)
}
