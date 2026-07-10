fn main() {
    let is_windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");

    if is_windows_msvc {
        println!("cargo:rustc-link-lib=delayimp");
        println!("cargo:rustc-link-arg-bin=sona=/DELAYLOAD:vulkan-1.dll");
    }
}
