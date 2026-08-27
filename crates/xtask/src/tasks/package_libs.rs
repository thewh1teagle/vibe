use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use flate2::write::GzEncoder;
use flate2::Compression;

use crate::tools::paths;

pub(super) fn package(build_dir: &Path, src_dir: &Path, archive: &Path) -> Result<()> {
    let pkg = build_dir.join("pkg");
    remove_dir_if_exists(&pkg)?;
    std::fs::create_dir_all(pkg.join("lib"))?;
    std::fs::create_dir_all(pkg.join("include"))?;

    for name in lib_names() {
        let (lib, matched_name) = find_lib(build_dir, name)?;
        println!(
            "  found {matched_name} at {} (packaged as {name})",
            lib.display()
        );
        std::fs::copy(lib, pkg.join("lib").join(name))?;
    }
    for header in [
        "ggml.h",
        "ggml-cpu.h",
        "ggml-alloc.h",
        "ggml-backend.h",
        "gguf.h",
    ] {
        std::fs::copy(
            src_dir.join("include").join(header),
            pkg.join("include").join(header),
        )?;
    }

    let file = std::fs::File::create(archive)?;
    let encoder = GzEncoder::new(file, Compression::default());
    let mut tar = tar::Builder::new(encoder);
    tar.append_dir_all("lib", pkg.join("lib"))?;
    tar.append_dir_all("include", pkg.join("include"))?;
    tar.finish()?;
    println!(
        "packaged {} ({} KB)",
        archive.display(),
        archive.metadata()?.len() / 1024
    );
    Ok(())
}

fn lib_names() -> Vec<&'static str> {
    if cfg!(target_os = "windows") && paths::windows_lib_flavor() == "msvc" {
        return vec![
            "ggml.lib",
            "ggml-base.lib",
            "ggml-cpu.lib",
            "ggml-vulkan.lib",
        ];
    }

    let mut names = vec![
        "libggml.a",
        "libggml-base.a",
        "libggml-cpu.a",
    ];
    if cfg!(target_os = "macos") {
        names.extend(["libggml-metal.a", "libggml-blas.a"]);
    } else if cfg!(any(target_os = "linux", target_os = "windows")) {
        names.push("libggml-vulkan.a");
    }
    if cfg!(target_os = "windows") {
        names.push("libvulkan-1-delay.a");
    }
    names
}

fn find_lib(build_dir: &Path, name: &str) -> Result<(PathBuf, String)> {
    let mut candidates = vec![name.to_string()];
    if cfg!(target_os = "windows") {
        if let Some(stripped) = name.strip_prefix("lib") {
            candidates.push(stripped.to_string());
        }
    }

    for candidate in candidates {
        if let Some(path) = find_file(build_dir, &candidate)? {
            return Ok((path, candidate));
        }
    }
    anyhow::bail!("{name} not found under {}", build_dir.display())
}

fn find_file(dir: &Path, name: &str) -> Result<Option<PathBuf>> {
    for entry in std::fs::read_dir(dir).with_context(|| format!("read {}", dir.display()))? {
        let entry = entry?;
        let path = entry.path();
        if path.file_name().is_some_and(|file_name| file_name == name) {
            return Ok(Some(path));
        }
        if path.is_dir() {
            if let Some(found) = find_file(&path, name)? {
                return Ok(Some(found));
            }
        }
    }
    Ok(None)
}

fn remove_dir_if_exists(path: &Path) -> Result<()> {
    if path.exists() {
        std::fs::remove_dir_all(path)?;
    }
    Ok(())
}
