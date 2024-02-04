use std::env;
use std::path::PathBuf;
use std::process::Command;

fn add_dylib(path: &str) {
    println!("cargo:rustc-env=LDFLAGS=-L{}", path);
}

fn add_include(path: &str) {
    println!("cargo:rustc-env=CPPFLAGS=-I{}", path);
}

fn add_link(name: &str) {
    println!("cargo:rustc-link-lib={}", name);
}

fn main() {
    let target = env::var("TARGET").unwrap();
    let ffmpeg_dir = env::var("FFMPEG_DIR");
    if let Ok(ffmpeg_dir) = ffmpeg_dir {
        let ffmpeg_dir = PathBuf::from(ffmpeg_dir);
        if !ffmpeg_dir.exists() {
            panic!("Cant find ffmpeg at {}", ffmpeg_dir.canonicalize().unwrap().display());
        }
    }
    // Link against Audio Toolbox framework on macOS
    if cfg!(target_os = "macos") {
        // Specify the library and include paths based on your environment
        println!("cargo:rerun-if-env-changed=LDFLAGS");
        println!("cargo:rerun-if-env-changed=CPPFLAGS");

        // Specify the library and include paths based on your environment
        add_dylib("/opt/homebrew/opt/bzip2/lib");
        add_include("/opt/homebrew/opt/bzip2/include");

        add_dylib("/opt/homebrew/opt/lz4/lib");
        add_include("/opt/homebrew/opt/lz4/include");

        add_link("framework=CoreAudio");
        add_link("framework=Metal");
        add_link("framework=Foundation");
        add_link("bz2");
        add_link("z");
        add_link("xml2");
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

    tauri_build::build()
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
