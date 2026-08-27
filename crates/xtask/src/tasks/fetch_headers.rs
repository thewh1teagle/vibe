use anyhow::{Context, Result};

use crate::tools::{download, paths};

const GGML_REPO: &str = "ggml-org/ggml";
const HEADERS: &[&str] = &[
    "include/ggml.h",
    "include/ggml-cpu.h",
    "include/ggml-alloc.h",
    "include/ggml-backend.h",
    "include/gguf.h",
];

pub fn run() -> Result<()> {
    let root = paths::repo_root()?;
    let version = paths::ggml_version()?;
    let out_dir = root.join("third_party/include");
    std::fs::create_dir_all(&out_dir)?;
    let now = current_utc_stamp()?;

    for path in HEADERS {
        let name = std::path::Path::new(path)
            .file_name()
            .context("header path has no filename")?
            .to_string_lossy();
        let source = format!("https://github.com/{GGML_REPO}/blob/{version}/{path}");
        let raw_url = format!("https://raw.githubusercontent.com/{GGML_REPO}/{version}/{path}");
        let body = String::from_utf8(download::bytes(&raw_url, 120)?)?;
        let stamped =
            format!("// Fetched: {now}\n// Source: {source}\n// Version: {version}\n\n{body}");
        std::fs::write(out_dir.join(name.as_ref()), stamped)?;
        println!("wrote {name} ({version})");
    }

    Ok(())
}

fn current_utc_stamp() -> Result<String> {
    let format =
        time::macros::format_description!("[year]-[month]-[day] [hour]:[minute]:[second] UTC");
    Ok(time::OffsetDateTime::now_utc().format(format)?)
}
