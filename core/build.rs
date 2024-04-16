use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

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
            let path = line.split('=').skip(1).next()?;
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


    if cfg!(feature = "opencl") {
        println!("cargo:rustc-link-search={}", clblast_dir.join("..\\..\\").display()); // clblast\lib\clblast.lib
        println!("cargo:rustc-link-search={}", "C:\\vcpkg\\packages\\opencl_x64-windows\\lib"); // C:\vcpkg\packages\opencl_x64-windows\lib\OpenCL.lib
    }

    if ffmpeg_dir.exists() {
        
        if !ffmpeg_dir.exists() {
            panic!("Cant find ffmpeg at {}", ffmpeg_dir.canonicalize().unwrap().display());
        }
        if cfg!(target_os = "macos") {
            let target_dir = get_cargo_target_dir().unwrap();

            for entry in glob::glob(&format!("{}/*.dylib", ffmpeg_dir.join("lib").to_str().unwrap())).unwrap() {
                match entry {
                    Ok(src) => {
                        let dst = Path::new(&target_dir).join(Path::new(src.file_name().unwrap()));
                        std::fs::copy(src, dst).unwrap();
                    }
                    _ => {}
                }
            }
        }

        if cfg!(target_os = "windows") {
            let target_dir = get_cargo_target_dir().unwrap();
            let patterns = [
                format!("{}\\*.dll", ffmpeg_dir.join("bin\\x64").to_str().unwrap()),
                format!("{}\\*.dll", openblas_dir.join("..\\bin").to_str().unwrap()),
                format!("{}\\*.dll", clblast_dir.join("..\\..\\..\\bin").to_str().unwrap()),
            ];
            for pattern in patterns {
                for entry in glob::glob(&pattern).unwrap() {
                    match entry {
                        Ok(src) => {
                            let dst = Path::new(&target_dir).join(Path::new(src.file_name().unwrap()));
                            std::fs::copy(src, dst).unwrap();
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    if cfg!(target_os = "windows") {
        let openblas_path = std::env::var("OPENBLAS_PATH").unwrap();
        println!(
            "cargo:rustc-link-search=native={}",
            PathBuf::from(openblas_path.clone()).to_str().unwrap()
        );
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
}
