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
    let src_locales = src_tauri.join("locales");
    let target_locales = target_dir.join("locales");

    // Specify copy options
    let mut options = CopyOptions::new();
    options.overwrite = true; // Allow overwriting existing files/directories

    // Copy the locales folder to the target directory
    copy(src_locales, target_locales.parent().unwrap(), &options).unwrap_or_else(|err| {
        panic!("Failed to copy locales folder: {}", err);
    });
}

fn extract_whisper_env() {
    println!("cargo:rerun-if-env-changed=WHISPER_NO_AVX");
    println!("cargo:rerun-if-env-changed=WHISPER_NO_AVX2");
    println!("cargo:rerun-if-env-changed=WHISPER_NO_FMA");
    println!("cargo:rerun-if-env-changed=WHISPER_NO_F16C");
    println!(
        "cargo:rustc-env=WHISPER_NO_AVX={}",
        std::env::var("WHISPER_NO_AVX").unwrap_or_default().trim()
    );
    println!(
        "cargo:rustc-env=WHISPER_NO_AVX2={}",
        std::env::var("WHISPER_NO_AVX2").unwrap_or_default().trim()
    );
    println!(
        "cargo:rustc-env=WHISPER_NO_FMA={}",
        std::env::var("WHISPER_NO_FMA").unwrap_or_default().trim()
    );
    println!(
        "cargo:rustc-env=WHISPER_NO_F16C={}",
        std::env::var("WHISPER_NO_F16C").unwrap_or_default().trim()
    );
}

fn main() {
    let hash = commit_hash();
    println!("cargo:rerun-if-env-changed=COMMIT_HASH");
    println!("cargo:rustc-env=COMMIT_HASH={}", hash);

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

    // Windows portable
    println!("cargo:rerun-if-env-changed=WINDOWS_PORTABLE");
    println!(
        "cargo:rustc-env=WINDOWS_PORTABLE={}",
        std::env::var("WINDOWS_PORTABLE").unwrap_or_default().trim()
    );

    copy_locales();
    extract_whisper_env();
    tauri_build::build();
}
