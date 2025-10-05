use vibe_core::{config::TranscribeOptions, transcribe};

#[test]
fn test_transcribe_contract() {
    // This test will fail until the transcribe function is implemented with faster-whisper
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
    assert!(result.is_ok(), "Transcribe should succeed");
    let transcription = result.unwrap();
    assert!(!transcription.as_text().is_empty(), "Transcription text should not be empty");
    assert!(!transcription.segments.is_empty(), "Should have segments");
}
