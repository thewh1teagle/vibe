use std::path::Path;
use std::process::Command;

use anyhow::Result;

use crate::cli::BuildLibsArgs;
use crate::tasks::package_libs;
use crate::tools::{paths, process};

const GGML_REPO: &str = "https://github.com/ggml-org/ggml.git";

pub fn run(args: BuildLibsArgs) -> Result<()> {
    let root = paths::repo_root()?;
    let version = paths::ggml_version()?;
    let platform = paths::platform_id();
    let src_dir = root.join("ggml-src");
    let build_dir = root.join("ggml-build");
    let archive = root.join(format!("ggml-libs-{platform}.tar.gz"));

    println!("ggml: {version}");
    println!("platform: {platform}");

    clone(&version, &src_dir)?;
    build(&src_dir, &build_dir)?;
    build_vulkan_delay_lib(&build_dir)?;
    package_libs::package(&build_dir, &src_dir, &archive)?;

    if args.upload {
        upload(&archive, &format!("libraries-ggml-{version}"))?;
    }

    Ok(())
}

fn clone(version: &str, src_dir: &Path) -> Result<()> {
    remove_dir_if_exists(src_dir)?;
    std::fs::create_dir_all(src_dir)?;
    process::run(Command::new("git").arg("init").current_dir(src_dir))?;
    process::run(
        Command::new("git")
            .args(["remote", "add", "origin", GGML_REPO])
            .current_dir(src_dir),
    )?;
    process::run(
        Command::new("git")
            .args(["fetch", "--depth", "1", "origin", version])
            .current_dir(src_dir),
    )?;
    process::run(
        Command::new("git")
            .args(["checkout", "FETCH_HEAD"])
            .current_dir(src_dir),
    )?;
    process::run(
        Command::new("git")
            .args([
                "submodule",
                "update",
                "--init",
                "--depth",
                "1",
                "--recursive",
            ])
            .current_dir(src_dir),
    )
}

fn build(src_dir: &Path, build_dir: &Path) -> Result<()> {
    remove_dir_if_exists(build_dir)?;
    let mut configure = Command::new("cmake");
    configure.arg("-S").arg(src_dir).arg("-B").arg(build_dir);
    for flag in cmake_flags() {
        configure.arg(flag);
    }
    process::run(&mut configure)?;

    let jobs = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4)
        .to_string();
    process::run(
        Command::new("cmake")
            .arg("--build")
            .arg(build_dir)
            .args(["--config", "Release"])
            .arg(format!("-j{jobs}")),
    )
}

fn cmake_flags() -> Vec<&'static str> {
    let mut flags = vec![
        "-DCMAKE_BUILD_TYPE=Release",
        "-DBUILD_SHARED_LIBS=OFF",
        "-DGGML_BUILD_EXAMPLES=OFF",
        "-DGGML_BUILD_TESTS=OFF",
    ];
    if cfg!(target_os = "macos") {
        flags.extend([
            "-DGGML_METAL=ON",
            "-DGGML_METAL_EMBED_LIBRARY=ON",
            "-DGGML_BLAS=ON",
            "-DGGML_BLAS_VENDOR=Apple",
            "-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0",
        ]);
    } else if cfg!(any(target_os = "linux", target_os = "windows")) {
        // x86 builds ship every CPU-variant backend as a loadable module and
        // pick the best one at runtime by cpuid score, so old machines
        // without AVX2 fall back instead of dying on an illegal instruction.
        flags.extend([
            "-DGGML_VULKAN=ON",
            "-DGGML_BACKEND_DL=ON",
            "-DGGML_CPU_ALL_VARIANTS=ON",
        ]);
    }
    if cfg!(target_os = "windows") && paths::windows_lib_flavor() == "gnu" {
        flags.extend(["-G", "MinGW Makefiles"]);
    }
    flags
}

fn build_vulkan_delay_lib(build_dir: &Path) -> Result<()> {
    if !cfg!(target_os = "windows") || paths::windows_lib_flavor() != "gnu" {
        return Ok(());
    }

    let delay_dir = build_dir.join("delay");
    std::fs::create_dir_all(&delay_dir)?;
    let dll_path = find_windows_vulkan_dll().unwrap_or_else(|| "vulkan-1.dll".to_string());
    process::run(Command::new("gendef").arg(dll_path).current_dir(&delay_dir))?;
    process::run(
        Command::new("dlltool")
            .args([
                "--input-def",
                "vulkan-1.def",
                "--output-delaylib",
                "libvulkan-1-delay.a",
            ])
            .current_dir(&delay_dir),
    )
}

fn find_windows_vulkan_dll() -> Option<String> {
    let output = Command::new("where").arg("vulkan-1.dll").output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()?
        .lines()
        .next()
        .map(str::to_string)
}

fn upload(archive: &Path, tag: &str) -> Result<()> {
    let _ = Command::new("gh")
        .args(["release", "create", tag, "--generate-notes"])
        .status();

    for attempt in 1..=5 {
        let status = Command::new("gh")
            .args(["release", "upload", tag])
            .arg(archive)
            .arg("--clobber")
            .status()?;
        if status.success() {
            println!("uploaded {} to release {tag}", archive.display());
            return Ok(());
        }
        println!("upload attempt {attempt} failed, retrying...");
        std::thread::sleep(std::time::Duration::from_secs(3));
    }
    anyhow::bail!("failed to upload {} after 5 attempts", archive.display())
}

fn remove_dir_if_exists(path: &Path) -> Result<()> {
    if path.exists() {
        std::fs::remove_dir_all(path)?;
    }
    Ok(())
}
