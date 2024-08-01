/*
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
cargo test --features "opencl" -- --nocapture
cargo test --release --features "opencl" -- --nocapture
*/
use crate::{config::TranscribeOptions, transcribe::create_context};
use serial_test::serial;
use std::path::PathBuf;
use tracing_test::traced_test;
pub use whisper_rs::SegmentCallbackData;

#[test]
#[serial]
#[traced_test]
fn test_transcribe() {
    let ctx = create_context(&PathBuf::from("../ggml-tiny.bin"), None).unwrap();
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

#[test]
#[serial]
#[traced_test]
fn test_transcribe_with_callbacks() {
    let ctx = create_context(&PathBuf::from("../ggml-tiny.bin"), None).unwrap();
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

    let progress_callback = |progress: i32| {
        tracing::debug!("desktop progress is {}", progress);
        println!("{}%", progress);
    };

    let new_segment_callback = move |data: SegmentCallbackData| {
        println!("{:?}", data);
    };

    let result = crate::transcribe::transcribe(
        &ctx,
        options,
        Some(Box::new(progress_callback)),
        Some(Box::new(new_segment_callback)),
        None,
        None,
    )
    .unwrap();
    println!("{:?}", result);
}
