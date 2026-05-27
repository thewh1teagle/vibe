use std::env;
use std::path::{Path, PathBuf};

fn commit_hash() -> String {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output();
    match output {
        Ok(o) if o.status.success() => String::from_utf8(o.stdout).unwrap_or_else(|_| "unknown".to_string()),
        _ => "unknown".to_string(),
    }
}

fn copy_folder(src: &Path, dst: &Path) {
    std::fs::create_dir_all(dst).expect("Failed to create dst directory");
    if cfg!(unix) {
        if let Some(parent) = dst.parent() {
            std::process::Command::new("cp")
                .arg("-rf")
                .arg(src)
                .arg(parent)
                .status()
                .expect("Failed to execute cp command");
        }
    }

    if cfg!(windows) {
        // robocopy exit codes 0-7 are success/warning levels; 8+ are errors
        let status = std::process::Command::new("robocopy.exe")
            .arg("/e")
            .arg(src)
            .arg(dst)
            .status()
            .expect("Failed to execute robocopy command");
        let code = status.code().unwrap_or(16);
        if code >= 8 {
            panic!("robocopy failed with exit code {}", code);
        }
    }
}

fn copy_locales() {
    let src_tauri = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    // Walk up from OUT_DIR to find the target directory (contains debug/release)
    let mut target_dir = out_dir.as_path();
    loop {
        let parent = target_dir.parent();
        match parent {
            Some(p) if p.join("debug").exists() || p.join("release").exists() => {
                target_dir = p;
                break;
            }
            Some(p) => target_dir = p,
            None => break,
        }
    }

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
