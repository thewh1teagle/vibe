//! OpenAI's repetition gate: a window whose text compresses too well is a
//! decoder stuck in a loop, so the fallback ladder retries it hotter.
//! whisper.cpp dropped this in favour of an entropy check over the last 32
//! tokens, which a window holding a few copies of one short line slips past.

use std::io::Write;

use flate2::write::ZlibEncoder;
use flate2::Compression;

use crate::vocab::Vocab;
use crate::TokenData;

/// `len(text) / len(zlib.compress(text))` from openai-whisper's `utils.py`,
/// over the window's text tokens only (timestamps and specials excluded).
pub(crate) fn window_compression_ratio(vocab: &Vocab, tokens: &[TokenData]) -> f32 {
    let mut text = Vec::new();
    for token in tokens.iter().filter(|token| token.id < vocab.token_eot) {
        text.extend_from_slice(vocab.token_bytes(token.id));
    }
    compression_ratio(&text)
}

fn compression_ratio(text: &[u8]) -> f32 {
    if text.is_empty() {
        return 0.0;
    }
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    // Writing into a Vec cannot fail.
    encoder.write_all(text).expect("in-memory zlib write");
    let compressed = encoder.finish().expect("in-memory zlib finish");
    text.len() as f32 / compressed.len() as f32
}

#[cfg(test)]
mod tests {
    use super::compression_ratio;

    #[test]
    fn normal_speech_stays_under_the_gate() {
        let line = b"So good to hear you on the phone. I've been counting down since you've been gone. \
                     Some days are harder, harder than the rest. Just remember, it's when you might forget.";
        assert!(compression_ratio(line) < 2.4);
    }

    #[test]
    fn a_looping_line_trips_the_gate() {
        let looped = " I can't wait till tomorrow, baby.".repeat(6);
        assert!(compression_ratio(looped.as_bytes()) > 2.4);
    }

    #[test]
    fn empty_text_never_trips_the_gate() {
        assert_eq!(compression_ratio(b""), 0.0);
    }
}
