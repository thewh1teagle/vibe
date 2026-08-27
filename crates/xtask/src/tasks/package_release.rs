use std::path::Path;

use anyhow::Result;

use crate::cli::{PackageReleaseArgs, TargetArch, TargetOs};
use crate::tools::{archives, download};

pub fn run(args: PackageReleaseArgs) -> Result<()> {
    package(&args.binary, &args.out, args.goos, args.goarch)
}

fn package(binary_path: &Path, out_path: &Path, os: TargetOs, arch: TargetArch) -> Result<()> {
    anyhow::ensure!(
        binary_path.exists(),
        "binary not found: {}",
        binary_path.display()
    );

    let stage_dir = std::env::temp_dir().join(format!("sona-package-{}", std::process::id()));
    remove_dir_if_exists(&stage_dir)?;
    std::fs::create_dir_all(&stage_dir)?;

    let binary_name = if matches!(os, TargetOs::Windows) {
        "sona.exe"
    } else {
        "sona"
    };
    let target_binary = stage_dir.join(binary_name);
    std::fs::copy(binary_path, &target_binary)?;
    set_executable(&target_binary)?;

    copy_ffmpeg(&stage_dir, os, arch)?;
    copy_backend_modules(&stage_dir, os)?;

    if let Some(parent) = out_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }

    if matches!(os, TargetOs::Windows) {
        archives::write_zip_dir(&stage_dir, out_path)?;
    } else {
        archives::write_tar_gz_dir(&stage_dir, out_path)?;
    }

    remove_dir_if_exists(&stage_dir)?;
    println!(
        "packaged {} ({} KB)",
        out_path.display(),
        out_path.metadata()?.len() / 1024
    );
    Ok(())
}

/// Ships the GGML_BACKEND_DL backend modules (CPU variants + Vulkan) next to
/// the binary, where `ggml_backend_load_all` looks for them at startup.
/// macOS builds are fully static and have none.
fn copy_backend_modules(stage_dir: &Path, os: TargetOs) -> Result<()> {
    if matches!(os, TargetOs::Darwin) {
        return Ok(());
    }
    let modules_dir = crate::tools::paths::repo_root()?.join("third_party/modules");
    if !modules_dir.exists() {
        anyhow::bail!(
            "backend modules not found at {}; run `cargo xtask fetch-libs` (or build-libs) first",
            modules_dir.display()
        );
    }
    for entry in std::fs::read_dir(&modules_dir)? {
        let path = entry?.path();
        if let Some(name) = path.file_name() {
            std::fs::copy(&path, stage_dir.join(name))?;
        }
    }
    Ok(())
}

fn copy_ffmpeg(stage_dir: &Path, os: TargetOs, arch: TargetArch) -> Result<()> {
    let url = resolve_ffmpeg_url(os, arch)?;
    let data = download::bytes(url, 180)?;
    let filename = if matches!(os, TargetOs::Windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let ffmpeg = archives::read_zip_file(&data, filename)?;
    let path = stage_dir.join(filename);
    std::fs::write(&path, ffmpeg)?;
    set_executable(&path)
}

fn resolve_ffmpeg_url(os: TargetOs, arch: TargetArch) -> Result<&'static str> {
    match (os, arch) {
        (TargetOs::Darwin, TargetArch::Amd64) => Ok("https://www.osxexperts.net/ffmpeg80intel.zip"),
        (TargetOs::Darwin, TargetArch::Arm64) => Ok("https://www.osxexperts.net/ffmpeg80arm.zip"),
        (TargetOs::Windows, TargetArch::Amd64) => {
            Ok("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip")
        }
        _ => anyhow::bail!(
            "unsupported target for ffmpeg URL: {}/{}",
            os.as_str(),
            arch.as_str()
        ),
    }
}

fn remove_dir_if_exists(path: &Path) -> Result<()> {
    if path.exists() {
        std::fs::remove_dir_all(path)?;
    }
    Ok(())
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = std::fs::metadata(path)?.permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<()> {
    Ok(())
}
