use std::env;
use std::path::{Path, PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let root = manifest_dir.parent().and_then(Path::parent).unwrap();
    let include_dir = root.join("third_party/include");
    let lib_dir = root.join("third_party/lib");
    let wrapper = manifest_dir.join("wrapper.h");

    for path in [&wrapper, &include_dir, &lib_dir] {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    if !include_dir.join("ggml.h").exists() {
        panic!("missing native headers; run `cargo xtask fetch-headers`");
    }
    if !lib_dir.exists() {
        panic!("missing native libraries; run `cargo xtask fetch-libs`");
    }

    let mut bindings = bindgen::Builder::default()
        .header(wrapper.to_string_lossy())
        .clang_arg(format!("-I{}", include_dir.display()))
        .allowlist_function("(ggml|gguf)_.*")
        .allowlist_type("(ggml|gguf)_.*")
        .allowlist_var("(GGML|GGUF)_.*")
        .generate_comments(false)
        .derive_default(true);
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        if let Ok(output) = std::process::Command::new("xcrun").args(["--show-sdk-path"]).output() {
            let sdk = String::from_utf8_lossy(&output.stdout).trim().to_owned();
            if output.status.success() && !sdk.is_empty() {
                bindings = bindings.clang_arg("-isysroot").clang_arg(sdk);
            }
        }
    }
    bindings
        .generate()
        .expect("failed to generate GGML bindings")
        .write_to_file(PathBuf::from(env::var("OUT_DIR").unwrap()).join("bindings.rs"))
        .expect("failed to write bindings");

    println!("cargo:include={}", include_dir.display());
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    // macOS links every backend statically. Linux/Windows are
    // GGML_BACKEND_DL builds: the CPU variants and Vulkan are loadable
    // modules shipped next to the executable and loaded at runtime with
    // `ggml_backend_load_all`, so only the registry and base link here.
    let static_libs: &[&str] = if cfg!(target_os = "macos") {
        &["ggml", "ggml-base", "ggml-cpu"]
    } else {
        &["ggml", "ggml-base"]
    };
    for lib in static_libs {
        println!("cargo:rustc-link-lib=static={lib}");
    }
    link_platform();
}

fn link_platform() {
    match env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("macos") => {
            for lib in ["ggml-metal", "ggml-blas"] {
                println!("cargo:rustc-link-lib=static={lib}");
            }
            for framework in ["Accelerate", "Metal", "Foundation", "MetalKit", "CoreGraphics"] {
                println!("cargo:rustc-link-lib=framework={framework}");
            }
            println!("cargo:rustc-link-lib=c++");
        }
        Ok("linux") => {
            for lib in ["stdc++", "m", "pthread"] {
                println!("cargo:rustc-link-lib={lib}");
            }
        }
        Ok("windows") => {
            if env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu") {
                for lib in ["stdc++", "winpthread"] {
                    println!("cargo:rustc-link-lib=static={lib}");
                }
                println!("cargo:rustc-link-lib=m");
            }
        }
        other => panic!("unsupported target OS: {other:?}"),
    }
}
