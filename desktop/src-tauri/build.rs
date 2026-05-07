use std::env;
use std::path::{Path, PathBuf};

fn commit_hash() -> String {
    let output = match std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            eprintln!("cargo:warning=git not found: {}", e);
            return String::from("unknown");
        }
    };
    let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if hash.is_empty() {
        String::from("unknown")
    } else {
        hash
    }
}

fn copy_folder(src: &Path, dst: &Path) {
    std::fs::create_dir_all(dst).expect("Failed to create dst directory");
    fn copy_recursive(src: &Path, dst: &Path) {
        if src.is_dir() {
            std::fs::create_dir_all(dst).expect("Failed to create dir");
            for entry in std::fs::read_dir(src).expect("Failed to read dir") {
                let entry = entry.expect("Failed to read entry");
                let src_path = entry.path();
                let dst_path = dst.join(entry.file_name());
                copy_recursive(&src_path, &dst_path);
            }
        } else {
            std::fs::copy(src, dst).expect("Failed to copy file");
        }
    }
    copy_recursive(src, dst);
}

fn copy_locales() {
    let src_tauri = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let target_dir = out_dir.parent().unwrap().parent().unwrap().parent().unwrap();

    let src_locales = src_tauri.join("locales");
    let target_locales = target_dir.join("locales");
    copy_folder(src_locales.as_path(), &target_locales);
}

fn main() {
    let hash = commit_hash();
    println!("cargo:rerun-if-env-changed=COMMIT_HASH");
    println!("cargo:rustc-env=COMMIT_HASH={}", hash);

    // Analytics
    println!("cargo:rerun-if-env-changed=APTABASE_KEY");

    copy_locales();
    tauri_build::build();
}
