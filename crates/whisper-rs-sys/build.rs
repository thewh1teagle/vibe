use std::env;
use std::path::{Path, PathBuf};

const WHISPER_CPP_TAG: &str = "v1.7.6";

fn main() {
    println!("cargo:rerun-if-env-changed=WHISPER_CPP_DIR");
    println!("cargo:rerun-if-env-changed=WHISPER_CPP_TAG");
    println!("cargo:rerun-if-changed=wrapper.h");

    let source = whisper_source();
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let enable_metal = target_os == "macos" || env::var_os("CARGO_FEATURE_METAL").is_some();
    let enable_vulkan = matches!(target_os.as_str(), "windows" | "linux") || env::var_os("CARGO_FEATURE_VULKAN").is_some();

    let mut config = cmake::Config::new(&source);
    config
        .profile("Release")
        .define("BUILD_SHARED_LIBS", "OFF")
        .define("WHISPER_ALL_WARNINGS", "OFF")
        .define("WHISPER_ALL_WARNINGS_3RD_PARTY", "OFF")
        .define("WHISPER_BUILD_TESTS", "OFF")
        .define("WHISPER_BUILD_EXAMPLES", "OFF")
        .define("WHISPER_BUILD_SERVER", "OFF")
        .define("WHISPER_BUILD_SHARED_LIBS", "OFF")
        .define("GGML_STATIC", "ON")
        .define("GGML_NATIVE", "OFF")
        .define("GGML_OPENMP", "OFF");

    if target_os == "macos" {
        config.define("CMAKE_OSX_DEPLOYMENT_TARGET", "11.0");
    }

    if enable_metal {
        config
            .define("GGML_METAL", "ON")
            .define("GGML_METAL_NDEBUG", "ON")
            .define("GGML_METAL_EMBED_LIBRARY", "ON");
    } else {
        config.define("GGML_METAL", "OFF");
    }

    if enable_vulkan {
        config.define("GGML_VULKAN", "ON");
        if target_os == "windows" {
            println!("cargo:rerun-if-env-changed=VULKAN_SDK");
            let vulkan_sdk = env::var("VULKAN_SDK").expect("VULKAN_SDK must be set when building Vulkan on Windows");
            println!(
                "cargo:rustc-link-search=native={}",
                PathBuf::from(vulkan_sdk).join("Lib").display()
            );
        }
    } else {
        config.define("GGML_VULKAN", "OFF");
    }

    for (key, value) in env::vars() {
        let is_whisper_flag = key.starts_with("WHISPER_") && key != "WHISPER_CPP_DIR" && key != "WHISPER_CPP_TAG";
        if is_whisper_flag || key.starts_with("GGML_") || key.starts_with("CMAKE_") {
            println!("cargo:rerun-if-env-changed={key}");
            config.define(&key, &value);
        }
    }

    let dst = config.build();
    let lib_dir = dst.join("lib");
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=static=whisper");
    println!("cargo:rustc-link-lib=static=ggml");
    println!("cargo:rustc-link-lib=static=ggml-base");
    println!("cargo:rustc-link-lib=static=ggml-cpu");
    println!("cargo:rustc-link-lib=static=ggml-blas");

    if enable_metal {
        println!("cargo:rustc-link-lib=static=ggml-metal");
        println!("cargo:rustc-link-lib=framework=Accelerate");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=Metal");
        println!("cargo:rustc-link-lib=framework=MetalKit");
    }
    if enable_vulkan {
        println!("cargo:rustc-link-lib=static=ggml-vulkan");
        if target_os == "windows" {
            println!("cargo:rustc-link-lib=dylib=vulkan-1");
        } else {
            println!("cargo:rustc-link-lib=dylib=vulkan");
        }
    }
    if target_os == "linux" {
        println!("cargo:rustc-link-lib=dylib=stdc++");
        println!("cargo:rustc-link-lib=dylib=pthread");
        println!("cargo:rustc-link-lib=dylib=dl");
        println!("cargo:rustc-link-lib=dylib=m");
    } else if target_os == "macos" {
        println!("cargo:rustc-link-lib=dylib=c++");
    } else if target_os == "windows" {
        println!("cargo:rustc-link-lib=dylib=stdc++");
        println!("cargo:rustc-link-lib=dylib=advapi32");
    }

    generate_bindings(&source);
}

fn whisper_source() -> PathBuf {
    if let Some(path) = env::var_os("WHISPER_CPP_DIR") {
        return PathBuf::from(path);
    }

    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR"));
    let tag = env::var("WHISPER_CPP_TAG").unwrap_or_else(|_| WHISPER_CPP_TAG.to_string());
    let source = out_dir.join(format!("whisper.cpp-{}", tag.trim_start_matches('v')));
    if source.join("include/whisper.h").exists() {
        return source;
    }

    let archive = out_dir.join(format!("{tag}.tar.gz"));
    let url = format!("https://github.com/ggerganov/whisper.cpp/archive/refs/tags/{tag}.tar.gz");
    run("curl", &["-L", "-o", archive.to_str().unwrap(), &url], None);
    run(
        "tar",
        &["-xzf", archive.to_str().unwrap(), "-C", out_dir.to_str().unwrap()],
        None,
    );
    source
}

fn generate_bindings(source: &Path) {
    let header = source.join("include/whisper.h");
    let mut builder = bindgen::Builder::default()
        .header(header.to_string_lossy())
        .allowlist_function("whisper_.*")
        .allowlist_function("ggml_log_set")
        .allowlist_function("ggml_backend_dev_.*")
        .allowlist_type("ggml_log_.*")
        .allowlist_type("ggml_backend_dev.*")
        .allowlist_type("ggml_backend_device.*")
        .allowlist_var("GGML_LOG_LEVEL_.*")
        .allowlist_var("GGML_BACKEND_DEVICE_TYPE_.*")
        .allowlist_type("whisper_.*")
        .allowlist_var("WHISPER_.*")
        .clang_arg(format!("-I{}", source.join("include").display()))
        .clang_arg(format!("-I{}", source.join("ggml/include").display()));

    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let sdk = std::process::Command::new("xcrun")
            .args(["--sdk", "macosx", "--show-sdk-path"])
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if let Some(sdk) = sdk {
            builder = builder.clang_arg("-isysroot").clang_arg(sdk);
        }
    }

    let bindings = builder.generate().expect("generate whisper bindings");

    let out = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR")).join("bindings.rs");
    bindings.write_to_file(out).expect("write whisper bindings");
}

fn run(program: &str, args: &[&str], cwd: Option<&Path>) {
    let mut command = std::process::Command::new(program);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let status = command
        .status()
        .unwrap_or_else(|err| panic!("failed to run {program}: {err}"));
    assert!(status.success(), "{program} failed with {status}");
}
