fn main() {
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let is_windows_msvc = os == "windows" && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");

    if is_windows_msvc {
        println!("cargo:rustc-link-lib=delayimp");
        println!("cargo:rustc-link-arg-bin=sona=/DELAYLOAD:vulkan-1.dll");
    }

    // ggml's registry references ggml_backend_cpu_reg, which ggml-rs-sys defines in Rust
    // on x86_64 (cpu_variant.rs). A GNU linker only pulls an archive member for a symbol
    // that is already undefined when it reaches the archive, and the rlib comes before
    // ggml on the link line, so name the symbol up front. Dependencies cannot pass link
    // args, hence here rather than in ggml-rs-sys.
    if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("x86_64") && (os == "linux" || os == "windows") {
        if is_windows_msvc {
            println!("cargo:rustc-link-arg-bin=sona=/INCLUDE:ggml_backend_cpu_reg");
        } else {
            println!("cargo:rustc-link-arg-bin=sona=-Wl,--undefined=ggml_backend_cpu_reg");
        }
    }
}
