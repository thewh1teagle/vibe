use std::env;
use std::path::{Path, PathBuf};

fn commit_hash() -> String {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
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

    // Construct the source and target paths for the locales folder
    let src_locales = src_tauri.join("locales");
    let target_locales = target_dir.join("locales");
    copy_folder(src_locales.as_path(), &target_locales);
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
