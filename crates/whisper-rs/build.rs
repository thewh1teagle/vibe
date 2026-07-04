use std::env;
use std::path::{Path, PathBuf};

fn main() {
    let ffi_enabled = env::var_os("CARGO_FEATURE_FFI").is_some();
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let root = manifest_dir
        .parent()
        .and_then(Path::parent)
        .expect("crates/whisper-rs should live under the workspace root");
    let include_dir = root.join("third_party/include");
    let lib_dir = root.join("third_party/lib");

    println!("cargo:rerun-if-changed={}", include_dir.display());
    println!("cargo:rerun-if-changed={}", lib_dir.display());

    if !ffi_enabled {
        return;
    }

    if !include_dir.join("whisper.h").exists() {
        panic!(
            "missing {}; fetch headers before building whisper-rs",
            include_dir.join("whisper.h").display()
        );
    }

    if !lib_dir.exists() {
        panic!(
            "missing {}; run `cargo xtask fetch-libs` before building whisper-rs with `--features ffi`",
            lib_dir.display()
        );
    }

    println!("cargo:include={}", include_dir.display());
    println!("cargo:rustc-link-search=native={}", lib_dir.display());

    generate_bindings(&include_dir);

    link_common_libs();
    link_platform_libs();
}

fn generate_bindings(include_dir: &Path) {
    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap()).join("bindings.rs");
    let wrapper = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("wrapper.h");

    println!("cargo:rerun-if-changed={}", wrapper.display());
    println!(
        "cargo:rerun-if-changed={}",
        include_dir.join("whisper.h").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        include_dir.join("ggml-backend.h").display()
    );

    let mut builder = bindgen::Builder::default()
        .header(wrapper.to_string_lossy())
        .clang_arg(format!("-I{}", include_dir.display()))
        .allowlist_function("whisper_.*")
        .allowlist_function("ggml_backend_dev_.*")
        .allowlist_type("whisper_.*")
        .allowlist_type("ggml_.*")
        .allowlist_var("WHISPER_SAMPLE_RATE")
        .generate_comments(false)
        .derive_default(true);

    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        if let Ok(output) = std::process::Command::new("xcrun")
            .args(["--show-sdk-path"])
            .output()
        {
            if output.status.success() {
                let sdk_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !sdk_path.is_empty() {
                    builder = builder.clang_arg("-isysroot").clang_arg(sdk_path);
                }
            }
        }
    }

    builder
        .generate()
        .expect("failed to generate whisper.cpp bindings")
        .write_to_file(out_path)
        .expect("failed to write whisper.cpp bindings");
}

fn link_common_libs() {
    println!("cargo:rustc-link-lib=static=whisper");
    println!("cargo:rustc-link-lib=static=ggml");
    println!("cargo:rustc-link-lib=static=ggml-base");
    println!("cargo:rustc-link-lib=static=ggml-cpu");
}

fn link_platform_libs() {
    match env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("macos") => {
            println!("cargo:rustc-link-lib=static=ggml-metal");
            println!("cargo:rustc-link-lib=static=ggml-blas");
            println!("cargo:rustc-link-lib=framework=Accelerate");
            println!("cargo:rustc-link-lib=framework=Metal");
            println!("cargo:rustc-link-lib=framework=Foundation");
            println!("cargo:rustc-link-lib=framework=MetalKit");
            println!("cargo:rustc-link-lib=framework=CoreGraphics");
            println!("cargo:rustc-link-lib=c++");
        }
        Ok("linux") => {
            println!("cargo:rustc-link-lib=static=ggml-vulkan");
            println!("cargo:rustc-link-lib=vulkan");
            println!("cargo:rustc-link-lib=stdc++");
            println!("cargo:rustc-link-lib=m");
            println!("cargo:rustc-link-lib=pthread");
            println!("cargo:rustc-link-lib=gomp");
        }
        Ok("windows") => {
            println!("cargo:rustc-link-lib=static=ggml-vulkan");
            println!("cargo:rustc-link-lib=static=vulkan-1-delay");
            println!("cargo:rustc-link-lib=m");
            println!("cargo:rustc-link-lib=static=stdc++");
            println!("cargo:rustc-link-lib=static=gomp");
            println!("cargo:rustc-link-lib=static=winpthread");
        }
        Ok(other) => panic!("unsupported target OS for whisper-rs: {other}"),
        Err(err) => panic!("failed to read CARGO_CFG_TARGET_OS: {err}"),
    }
}
