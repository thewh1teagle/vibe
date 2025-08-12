/*
wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-tiny.bin
cargo test --features "vulkan" -- --nocapture
cargo test --release --features "vulkan" -- --nocapture
*/
use crate::{config::TranscribeOptions, transcribe::create_context};
use serial_test::serial;
use std::path::PathBuf;
use std::time::Instant;
use tracing_test::traced_test;

#[test]
#[serial]
#[traced_test]
fn test_transcribe() {
    let ctx = create_context(&PathBuf::from("../ggml-tiny.bin"), None, None).unwrap();
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
        sampling_bestof_or_beam_size: None,
        sampling_strategy: None,
    };
    let start = Instant::now();
    let result = crate::transcribe::transcribe(&ctx, options, None, None, None, None, None);
    println!("{:?}", result);
    println!(
        "Elapsed time: {:.2} seconds",
        Instant::now().duration_since(start).as_secs_f64()
    );
}

#[test]
#[serial]
#[traced_test]
fn test_pyannote_feature_flag() {
    // Test that DiarizeOptions can be created regardless of feature flag
    let diarize_options = crate::transcribe::DiarizeOptions {
        segment_model_path: "test_segment.onnx".to_string(),
        embedding_model_path: "test_embedding.onnx".to_string(),
        threshold: 0.5,
        max_speakers: 2,
    };
    
    assert_eq!(diarize_options.threshold, 0.5);
    assert_eq!(diarize_options.max_speakers, 2);
    assert_eq!(diarize_options.segment_model_path, "test_segment.onnx");
    assert_eq!(diarize_options.embedding_model_path, "test_embedding.onnx");
    
    // Test that the struct is properly serializable
    let json = serde_json::to_string(&diarize_options).unwrap();
    let deserialized: crate::transcribe::DiarizeOptions = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.threshold, diarize_options.threshold);
    assert_eq!(deserialized.max_speakers, diarize_options.max_speakers);
}
