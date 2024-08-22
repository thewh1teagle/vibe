use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

fn copy_file(src: &Path, dst: &Path) {
    if dst.exists() {
        std::fs::remove_file(dst).unwrap();
    }
    std::fs::copy(src, dst).unwrap();
}

fn get_cargo_target_dir() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR")?);
    let profile = std::env::var("PROFILE")?;
    let mut target_dir = None;
    let mut sub_path = out_dir.as_path();
    while let Some(parent) = sub_path.parent() {
        if parent.ends_with(&profile) {
            target_dir = Some(parent);
            break;
        }
        sub_path = parent;
    }
    let target_dir = target_dir.ok_or("not found")?;
    Ok(target_dir.to_path_buf())
}

fn macos_link_search_path() -> Option<String> {
    let output = Command::new("clang").arg("--print-search-dirs").output().ok()?;
    if !output.status.success() {
        println!("failed to run 'clang --print-search-dirs', continuing without a link search path");
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("libraries: =") {
            let path = line.split('=').nth(1)?;
            return Some(format!("{}/lib/darwin", path));
        }
    }

    println!("failed to determine link search path, continuing without it");
    None
}

fn main() {
    let target = env::var("TARGET").unwrap();
    // ffmpeg
    let ffmpeg_dir = env::var("FFMPEG_DIR").unwrap_or_default();
    let ffmpeg_dir = PathBuf::from(ffmpeg_dir);
    // clblast
    let clblast_dir = env::var("CLBlast_DIR").unwrap_or_default();
    let clblast_dir = PathBuf::from(clblast_dir);

    // openblas
    let openblas_dir = env::var("OPENBLAS_PATH").unwrap_or_default();
    let openblas_dir = PathBuf::from(openblas_dir);

    // Sometimes it doesn't find the libs files after restring Github cache
    if cfg!(all(feature = "cuda", windows)) {
        let cuda_path = env::var("CUDA_PATH").unwrap_or_default();
        let cuda_path = PathBuf::from(cuda_path);
        println!("cargo:rustc-link-search={}", cuda_path.join("lib\\x64").display());
    }

    if ffmpeg_dir.exists() {
        if !ffmpeg_dir.exists() {
            panic!("Cant find ffmpeg at {}", ffmpeg_dir.canonicalize().unwrap().display());
        }
        if cfg!(target_os = "macos") {
            let target_dir = get_cargo_target_dir().unwrap();

            for entry in glob::glob(&format!("{}/*.dylib", ffmpeg_dir.join("lib").to_str().unwrap()))
                .unwrap()
                .flatten()
            {
                let dst = Path::new(&target_dir).join(Path::new(entry.file_name().unwrap()));
                copy_file(&entry, &dst);
            }

            for entry in glob::glob(&format!("{}/*", ffmpeg_dir.join("bin").to_str().unwrap()))
                .unwrap()
                .flatten()
            {
                let dst = Path::new(&target_dir).join(Path::new(entry.file_name().unwrap()));
                copy_file(&entry, &dst);
            }
        }

        if cfg!(target_os = "windows") {
            let target_dir = get_cargo_target_dir().unwrap();
            let patterns = [
                format!("{}\\*.dll", ffmpeg_dir.join("bin\\x64").to_str().unwrap()),
                format!("{}\\*.exe", ffmpeg_dir.join("bin\\x64").to_str().unwrap()),
                format!("{}\\*.dll", openblas_dir.join("..\\bin").to_str().unwrap()),
                format!("{}\\*.dll", clblast_dir.join("..\\..\\..\\bin").to_str().unwrap()),
            ];
            for pattern in patterns {
                for entry in glob::glob(&pattern).unwrap().flatten() {
                    let dst = Path::new(&target_dir).join(Path::new(entry.file_name().unwrap()));
                    copy_file(&entry, &dst);
                }
            }
        }
    }

    if cfg!(target_os = "windows") {
        let openblas_path = std::env::var("OPENBLAS_PATH").unwrap().parse::<PathBuf>().unwrap();
        let openblas_lib = openblas_path.join("lib");
        println!("cargo:rustc-link-search=native={}", openblas_lib.to_str().unwrap());
    }

    if target.contains("apple") {
        // On (older) OSX we need to link against the clang runtime,
        // which is hidden in some non-default path.
        //
        // More details at https://github.com/alexcrichton/curl-rust/issues/279.
        if let Some(path) = macos_link_search_path() {
            println!("cargo:rustc-link-lib=clang_rt.osx");
            println!("cargo:rustc-link-search={}", path);
        }
    }

    // Passed from Github action
    println!("cargo:rerun-if-env-changed=CUDA_VERSION");
    println!(
        "cargo:rustc-env=CUDA_VERSION={}",
        std::env::var("INPUT_CUDA_VERSION").unwrap_or_default()
    );

    // Passed from Github action
    println!("cargo:rerun-if-env-changed=ROCM_VERSION");
    println!(
        "cargo:rustc-env=ROCM_VERSION={}",
        std::env::var("INPUT_ROCM_VERSION").unwrap_or_default()
    );
    // Todo: link correctly in whisper-rs
    if cfg!(windows) {
        println!("cargo:rustc-link-lib=msvcrt");
    }   
}
