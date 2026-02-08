use std::env;
use std::path::{Path, PathBuf};

fn commit_hash() -> String {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .unwrap();
    String::from_utf8(output.stdout).unwrap()
}

fn copy_folder(src: &Path, dst: &Path) {
    std::fs::create_dir_all(dst).expect("Failed to create dst directory");
    if cfg!(unix) {
        std::process::Command::new("cp")
            .arg("-rf")
            .arg(src)
            .arg(dst.parent().unwrap())
            .status()
            .expect("Failed to execute cp command");
    }

    if cfg!(windows) {
        std::process::Command::new("robocopy.exe")
            .arg("/e")
            .arg(src)
            .arg(dst)
            .status()
            .expect("Failed to execute robocopy command");
    }
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

    // Windows portable
    println!("cargo:rerun-if-env-changed=WINDOWS_PORTABLE");
    println!(
        "cargo:rustc-env=WINDOWS_PORTABLE={}",
        std::env::var("WINDOWS_PORTABLE").unwrap_or_default().trim()
    );

    // Analytics
    println!("cargo:rerun-if-env-changed=APTABASE_KEY");

    copy_locales();
    tauri_build::build();
}
