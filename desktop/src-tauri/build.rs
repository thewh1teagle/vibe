fn commit_hash() -> String {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .unwrap();
    String::from_utf8(output.stdout).unwrap()
}
fn main() {
    let hash = commit_hash();
    println!("cargo:rustc-env=COMMIT_HASH={}", hash);
    tauri_build::build();
}
