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
    for module in find_backend_modules(build_dir)? {
        let name = module.file_name().context("module has no filename")?;
        println!("  found backend module {}", module.display());
        std::fs::create_dir_all(pkg.join("modules"))?;
        std::fs::copy(&module, pkg.join("modules").join(name))?;
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
    if pkg.join("modules").exists() {
        tar.append_dir_all("modules", pkg.join("modules"))?;
    }
    tar.finish()?;
    println!(
        "packaged {} ({} KB)",
        archive.display(),
        archive.metadata()?.len() / 1024
    );
    Ok(())
}

fn lib_names() -> Vec<&'static str> {
    // macOS links everything statically. Linux/Windows build with
    // GGML_BACKEND_DL + GGML_CPU_ALL_VARIANTS, so the CPU variants and the
    // Vulkan backend are loadable modules (collected separately by
    // `find_backend_modules`) and only the registry and base libraries are
    // linked into the binary.
    if cfg!(target_os = "windows") && paths::windows_lib_flavor() == "msvc" {
        return vec!["ggml.lib", "ggml-base.lib"];
    }

    let mut names = vec!["libggml.a", "libggml-base.a"];
    if cfg!(target_os = "macos") {
        names.extend(["libggml-cpu.a", "libggml-metal.a", "libggml-blas.a"]);
    }
    names
}

/// The loadable backend modules a GGML_BACKEND_DL build produces:
/// `libggml-cpu-<variant>.so` / `ggml-cpu-<variant>.dll` and the Vulkan
/// backend. They must end up next to the executable (or on
/// GGML_BACKEND_PATH) so `ggml_backend_load_all` finds them.
fn find_backend_modules(build_dir: &Path) -> Result<Vec<PathBuf>> {
    if cfg!(target_os = "macos") {
        return Ok(Vec::new());
    }
    let extension = if cfg!(target_os = "windows") { "dll" } else { "so" };
    let mut modules = Vec::new();
    collect_files(build_dir, &mut |path| {
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            return false;
        };
        let stem = name.trim_start_matches("lib");
        path.extension().is_some_and(|ext| ext == extension)
            && (stem.starts_with("ggml-cpu") || stem.starts_with("ggml-vulkan"))
    }, &mut modules)?;
    anyhow::ensure!(!modules.is_empty(), "no ggml backend modules found under {}", build_dir.display());
    Ok(modules)
}

fn collect_files(dir: &Path, matches: &mut dyn FnMut(&Path) -> bool, out: &mut Vec<PathBuf>) -> Result<()> {
    for entry in std::fs::read_dir(dir).with_context(|| format!("read {}", dir.display()))? {
        let path = entry?.path();
        if path.is_dir() {
            collect_files(&path, matches, out)?;
        } else if matches(&path) {
            out.push(path);
        }
    }
    Ok(())
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
