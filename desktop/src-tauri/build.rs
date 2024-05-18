use fs_extra::dir::{copy, CopyOptions};
use std::env;
use std::path::PathBuf;

fn commit_hash() -> String {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .unwrap();
    String::from_utf8(output.stdout).unwrap()
}

fn copy_locales() {
    let src_tauri = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let target_dir = out_dir.parent().unwrap().parent().unwrap().parent().unwrap();

    // Construct the source and target paths for the locales folder
    let src_locales = src_tauri.join("../locales");
    let target_locales = target_dir.join("locales");

    // Specify copy options
    let mut options = CopyOptions::new();
    options.overwrite = true; // Allow overwriting existing files/directories

    // Copy the locales folder to the target directory
    copy(src_locales, target_locales.parent().unwrap(), &options).unwrap_or_else(|err| {
        panic!("Failed to copy locales folder: {}", err);
    });
}

fn main() {
    let hash = commit_hash();
    println!("cargo:rustc-env=COMMIT_HASH={}", hash);
    copy_locales();
    tauri_build::build();
}
