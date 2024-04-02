use std::{path::PathBuf, str::FromStr};

use vibe::{self, config::ModelArgs};

fn main() {
    let transcript = vibe::model::transcribe(
        &ModelArgs {
            init_prompt: None,
            model: PathBuf::from_str("/Users/user/Library/Application Support/github.com.thewh1teagle.vibe/ggml-medium.bin")
                .unwrap(),
            path: PathBuf::from_str("../samples/single_speaker.wav").unwrap(),
            lang: Some("en".into()),
            verbose: true,
            n_threads: None,
            temperature: None,
        },
        None,
    )
    .unwrap();
    println!("{:?}", transcript)
}
