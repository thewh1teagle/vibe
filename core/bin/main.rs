use std::{path::PathBuf, str::FromStr};
use vibe::{self, config::TranscribeOptions};

fn get_model_path() -> String {
    // Get the current user
    let user = match std::env::var("USER") {
        Ok(val) => val,
        Err(_) => String::from(""),
    };

    // Define model paths for different operating systems

    if cfg!(target_os = "macos") {
        format!(
            "/Users/{}/Library/Application Support/github.com.thewh1teagle.vibe/ggml-medium.bin",
            user
        )
    } else if cfg!(target_os = "linux") {
        return format!("/home/{}/.local/share/github.com.thewh1teagle.vibe/ggml-medium.bin", user);
    } else if cfg!(target_os = "windows") {
        return format!(
            "{}/github.com.thewh1teagle.vibe/ggml-medium.bin",
            std::env::var("LOCALAPPDATA").unwrap_or_default()
        );
    } else {
        return String::from("Unsupported OS");
    }
}

fn main() {
    env_logger::init();
    let model_path = get_model_path();
    println!("model path is {}", model_path);
    let transcript = vibe::model::transcribe(
        &TranscribeOptions {
            init_prompt: None,
            model_path: PathBuf::from_str(&model_path).unwrap(),
            path: PathBuf::from_str("../samples/single.wav").unwrap(),
            lang: Some("en".into()),
            verbose: true,
            n_threads: Some(1),
            temperature: Some(0.4),
        },
        None,
        None,
        None,
    )
    .unwrap();
    println!("{:?}", transcript)
}
