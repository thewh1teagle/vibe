use vibe_core::{config::TranscribeOptions, transcribe};

#[test]
fn test_faster_whisper_integration() {
    // Integration test for faster-whisper transcription
    // This will fail until implementation is complete
    let options = TranscribeOptions {
        path: "../samples/short.wav".to_string(),
        lang: None,
        model: Some("base".to_string()),
        verbose: None,
        n_threads: None,
        init_prompt: None,
        temperature: None,
        translate: None,
        max_text_ctx: None,
        word_timestamps: None,
        max_sentence_len: None,
        sampling_strategy: None,
        sampling_bestof_or_beam_size: None,
    };
    let result = transcribe::transcribe(&options, None, None, None, None, None);
    if result.is_err() {
        println!("Error: {:?}", result);
    }
    assert!(result.is_ok(), "Integration transcription should succeed");
    let transcription = result.unwrap();
    println!("Transcription: {}", transcription.as_text());
    assert!(transcription.as_text().contains("Experience"), "Should transcribe correctly");
}
