use crate::config::TranscribeOptions;
use serial_test::serial;
use std::time::Instant;
use tracing_test::traced_test;

#[test]
#[serial]
#[traced_test]
fn test_transcribe() {
    let options = &TranscribeOptions {
        init_prompt: None,
        lang: Some("en".into()),
        model: Some("base".to_string()),
        max_sentence_len: None,
        path: "../../samples/short.wav".into(),
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
    let result = crate::transcribe::transcribe(options, None, None, None, None, None);
    println!("{:?}", result);
    println!(
        "Elapsed time: {:.2} seconds",
        Instant::now().duration_since(start).as_secs_f64()
    );
}
