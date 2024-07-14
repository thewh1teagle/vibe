/*
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
cargo test -- --nocapture
*/
use crate::{config::TranscribeOptions, transcribe::create_context};
use std::path::{Path, PathBuf};

#[test]
fn test_transcribe() {
    let ctx = create_context(&PathBuf::from("ggml-tiny.bin"), None).unwrap();
    let options = &TranscribeOptions {
        init_prompt: None,
        lang: Some("en".into()),
        max_sentence_len: None,
        path: "../samples/short.wav".into(),
        verbose: None,
        max_text_ctx: None,
        n_threads: None,
        temperature: None,
        translate: None,
        word_timestamps: None,
    };
    let result = crate::transcribe::transcribe(&ctx, options, None, None, None, None);
    println!("{:?}", result);
}
