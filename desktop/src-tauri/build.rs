use std::path::PathBuf;

fn add_dylib(path: &str) {
    println!("cargo:rustc-env=LDFLAGS=-L{}", path);
}

fn add_include(path: &str) {
    println!("cargo:rustc-env=CPPFLAGS=-I{}", path);
}

fn add_link(name: &str) {
    println!("cargo:rustc-link-lib={}", name);
}

fn main() {
    // Link against Audio Toolbox framework on macOS
    if cfg!(target_os = "macos") {
        let ffmpeg_path = PathBuf::from("ffmpeg-6.1-macOS-default");
        if !ffmpeg_path.exists() {
            panic!("Cant find ffmpeg at {}", ffmpeg_path.canonicalize().unwrap().display());
        }

        // Specify the library and include paths based on your environment
        println!("cargo:rerun-if-env-changed=LDFLAGS");
        println!("cargo:rerun-if-env-changed=CPPFLAGS");

        // Specify the library and include paths based on your environment
        add_dylib("/opt/homebrew/opt/bzip2/lib");
        add_include("/opt/homebrew/opt/bzip2/include");

        add_dylib("/opt/homebrew/opt/lz4/lib");
        add_include("/opt/homebrew/opt/lz4/include");

        add_link("framework=CoreAudio");
        add_link("framework=Metal");
        add_link("framework=Foundation");
        add_link("bz2");
        add_link("z");
        add_link("xml2");
    }

    if cfg!(target_os = "windows") {
        // let ffmpeg_dir = std::env::var("FFMPEG_DIR").unwrap(); // mingw prefix
        // // add_dylib(PathBuf::from(ffmpeg_dir.to_owned()).join("lib/x64").to_str().unwrap());
        // // add_dylib(PathBuf::from(ffmpeg_dir).join("lib/x64/pkgconfig").to_str().unwrap());
        // println!("cargo:warning={}", PathBuf::from(ffmpeg_dir.to_owned()).to_str().unwrap());
        // println!("cargo:warning={}", PathBuf::from(ffmpeg_dir.to_owned()).join("/lib/x64").to_str().unwrap());


        // let mingw_prefix = std::env::var("MINGW_PREFIX").unwrap();
        // println!("cargo:rustc-flags=-L{}", PathBuf::from(mingw_prefix.to_owned()).join("lib").to_str().unwrap());
        // println!("cargo:rustc-flags=-L{}", PathBuf::from(ffmpeg_dir.to_owned()).join("lib\\x64").to_str().unwrap());
        // println!("cargo:rustc-flags=-L{}", PathBuf::from(ffmpeg_dir.to_owned()).join("lib\\x64\\pkgconfig").to_str().unwrap());
        // add_link("bz2");
        // add_link("z");
        // add_link("xml2");
        // add_link("xmlls");
        // add_link("va_win32");
        // add_link("va");
    }
}
