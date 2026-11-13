//! Token timing and sentence segmentation.
//!
//! A token's time is the encoder frame it was emitted on, with no correction
//! for the model's emission lag (about a quarter second after the sound).

use crate::{Token, Tokenizer, Transcription};

/// A token lasts until the next one, but no longer than this (0.4 s at 25 Hz),
/// so the last word before a pause does not stretch across it.
const MAX_TOKEN_FRAMES: usize = 10;

/// Encoder frames that overlap `samples` of audio; never zero.
pub(crate) fn audio_frames(samples: usize, frame_samples: usize) -> usize {
    samples.div_ceil(frame_samples).max(1)
}

/// Turns emission frames into spans inside the chunk's audio. The search runs
/// over a padded tail, so the last tokens (usually the final period) can be
/// emitted after the audio ends: those are pulled back onto its last frame.
pub(crate) fn assign_times(tokens: &mut [Token], samples: usize, frame_samples: usize) {
    let limit = audio_frames(samples, frame_samples);
    for token in tokens.iter_mut() {
        token.frame = token.frame.min(limit - 1);
    }
    for index in 0..tokens.len() {
        let next = tokens.get(index + 1).map_or(limit, |token| token.frame);
        tokens[index].duration_frames = next.saturating_sub(tokens[index].frame).clamp(1, MAX_TOKEN_FRAMES);
    }
}

pub(crate) fn split_sentences(tokens: Vec<Token>, tokenizer: &Tokenizer) -> Vec<Transcription> {
    let mut segments = Vec::new();
    let mut start = 0;
    let mut push = |slice: &[Token]| {
        let ids = slice.iter().map(|token| token.id).collect::<Vec<_>>();
        let text = tokenizer.decode_clean(&ids);
        if !text.is_empty() {
            segments.push(Transcription {
                text,
                tokens: slice.to_vec(),
            });
        }
    };
    for (index, token) in tokens.iter().enumerate() {
        if !tokenizer.is_control(token.id) && tokenizer.piece(token.id).is_some_and(ends_sentence) {
            push(&tokens[start..=index]);
            start = index + 1;
        }
    }
    push(&tokens[start..]);
    segments
}

fn ends_sentence(piece: &str) -> bool {
    matches!(piece.trim_end().chars().last(), Some('.' | '?' | '!' | '。' | '？' | '！'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tokenizer::tests::hebrew;

    fn tokens(pairs: &[(u32, usize)]) -> Vec<Token> {
        pairs
            .iter()
            .map(|&(id, frame)| Token {
                id,
                frame,
                duration_frames: 1,
            })
            .collect()
    }

    fn spans(tokens: &[Token]) -> Vec<(usize, usize)> {
        tokens.iter().map(|token| (token.frame, token.duration_frames)).collect()
    }

    #[test]
    fn audio_frames_round_up_and_never_vanish() {
        assert_eq!(audio_frames(0, 640), 1);
        assert_eq!(audio_frames(640, 640), 1);
        assert_eq!(audio_frames(641, 640), 2);
        assert_eq!(audio_frames(69_030, 640), 108);
        assert_eq!(audio_frames(480_000, 640), 750);
    }

    #[test]
    fn tokens_last_until_the_next_one_up_to_the_cap() {
        let mut list = tokens(&[(3, 8), (4, 15), (5, 19), (6, 60)]);
        assert_eq!(MAX_TOKEN_FRAMES, 10);
        assign_times(&mut list, 64_000, 640);
        assert_eq!(spans(&list), [(8, 7), (15, 4), (19, 10), (60, 10)]);
    }

    #[test]
    fn tokens_from_the_padded_tail_are_clamped_to_the_audio() {
        let mut list = tokens(&[(3, 100), (4, 106), (5, 109), (10, 113)]);
        assign_times(&mut list, 69_030, 640);
        assert_eq!(spans(&list), [(100, 6), (106, 1), (107, 1), (107, 1)]);
        assert!(list
            .iter()
            .all(|token| (token.frame + token.duration_frames) * 640 <= 108 * 640));
        assert!(list.windows(2).all(|pair| pair[0].frame <= pair[1].frame));
    }

    #[test]
    fn a_chunk_shorter_than_a_frame_keeps_its_tokens_on_frame_zero() {
        let mut list = tokens(&[(3, 0), (4, 5)]);
        assign_times(&mut list, 100, 640);
        assert_eq!(spans(&list), [(0, 1), (0, 1)]);
        assign_times(&mut [], 0, 640);
    }

    #[test]
    fn splits_hebrew_at_sentence_punctuation_and_keeps_times() {
        let tokenizer = hebrew();
        let list = tokens(&[
            (3, 8),
            (4, 15),
            (5, 19),
            (6, 23),
            (7, 27),
            (10, 30),
            (9, 37),
            (11, 44),
            (12, 50),
        ]);
        let result = split_sentences(list, &tokenizer);
        let texts = result.iter().map(|segment| segment.text.as_str()).collect::<Vec<_>>();
        assert_eq!(texts, ["שלום לכולם.", "היום?", "OK"]);
        assert_eq!(result[0].tokens.first().unwrap().frame, 8);
        assert_eq!(result[0].tokens.last().unwrap().frame, 30);
        assert_eq!(result[1].tokens.first().unwrap().frame, 37);
        assert_eq!(result[2].tokens.len(), 1);
    }

    #[test]
    fn commas_do_not_split_and_empty_input_gives_nothing() {
        let tokenizer = hebrew();
        let result = split_sentences(tokens(&[(3, 0), (4, 2), (8, 4), (9, 6)]), &tokenizer);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].text, "שלום, היום");
        assert!(split_sentences(Vec::new(), &tokenizer).is_empty());
        assert!(split_sentences(tokens(&[(0, 0), (1, 1)]), &tokenizer).is_empty());
    }
}
