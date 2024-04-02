use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    let target = env::var("TARGET").unwrap();
    let ffmpeg_dir = env::var("FFMPEG_DIR");
    if let Ok(ffmpeg_dir) = ffmpeg_dir {
        let ffmpeg_dir = PathBuf::from(ffmpeg_dir);
        if !ffmpeg_dir.exists() {
            panic!("Cant find ffmpeg at {}", ffmpeg_dir.canonicalize().unwrap().display());
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
