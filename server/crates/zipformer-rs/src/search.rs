//! Greedy transducer search over the encoder output.

use crate::decoder::{Decoder, Joiner};

/// An emitted piece. `frame` counts 25 Hz encoder frames (0.04 s each);
/// the token spans `frame .. frame + duration_frames`.
#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub id: u32,
    pub frame: usize,
    pub duration_frames: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SearchConfig {
    pub blank_id: u32,
    /// Never emitted: a frame where it wins the argmax is treated as blank.
    pub unknown_id: u32,
    pub context_size: usize,
    pub max_symbols_per_frame: usize,
}

/// Walks the frames once. `predict` maps the last `context_size` ids (oldest
/// first, `None` before the start) to a decoder state and runs only after an
/// emission; `logits` scores one frame against that state.
///
/// The search starts from `[None, .., blank]` and emits at most
/// `max_symbols_per_frame` tokens before moving to the next frame.
pub(crate) fn greedy_search<S>(
    config: SearchConfig,
    frames: usize,
    vocab: usize,
    mut predict: impl FnMut(&[Option<u32>]) -> S,
    mut logits: impl FnMut(usize, &S, &mut [f32]),
) -> Vec<Token> {
    let mut context = vec![None; config.context_size];
    if let Some(last) = context.last_mut() {
        *last = Some(config.blank_id);
    }
    let mut state = predict(&context);
    let mut scores = vec![0.0f32; vocab];
    let mut tokens = Vec::new();
    for frame in 0..frames {
        for _ in 0..config.max_symbols_per_frame {
            logits(frame, &state, &mut scores);
            let id = argmax(&scores);
            if id == config.blank_id || id == config.unknown_id {
                break;
            }
            tokens.push(Token {
                id,
                frame,
                duration_frames: 1,
            });
            context.rotate_left(1);
            if let Some(last) = context.last_mut() {
                *last = Some(id);
            }
            state = predict(&context);
        }
    }
    tokens
}

/// Index of the first maximum, as `torch.argmax` reports it.
fn argmax(scores: &[f32]) -> u32 {
    let mut best = 0;
    for (index, &score) in scores.iter().enumerate() {
        if score > scores[best] {
            best = index;
        }
    }
    best as u32
}

/// Decodes `encoder` (row-major `[frames][joiner.encoder_dim()]`) from a fresh
/// context. `on_logits` sees the scores of every joiner evaluation.
pub(crate) fn decode(
    decoder: &Decoder,
    joiner: &Joiner,
    config: SearchConfig,
    encoder: &[f32],
    mut on_logits: impl FnMut(usize, &[f32]),
) -> Vec<Token> {
    let width = joiner.hidden();
    let projected = joiner.project_encoder(encoder);
    let mut hidden = vec![0.0f32; width];
    greedy_search(
        config,
        projected.len() / width,
        joiner.vocab(),
        |context| joiner.project_decoder(&decoder.forward(context)),
        |frame, state, scores| {
            joiner.logits(&projected[frame * width..(frame + 1) * width], state, &mut hidden, scores);
            on_logits(frame, scores);
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fbank::testdata::{clip, gguf, max_abs_diff, Npy, CLIPS};

    const CONFIG: SearchConfig = SearchConfig {
        blank_id: 0,
        unknown_id: 2,
        context_size: 2,
        max_symbols_per_frame: 1,
    };

    /// A joiner that plays back a script: `script[frame]` lists what wins on
    /// the first, second, .. evaluation of that frame.
    fn run(config: SearchConfig, script: &[&[u32]]) -> (Vec<Token>, Vec<Vec<Option<u32>>>) {
        let mut contexts = Vec::new();
        let mut evaluations = vec![0usize; script.len()];
        let tokens = greedy_search(
            config,
            script.len(),
            6,
            |context| contexts.push(context.to_vec()),
            |frame, _, scores| {
                scores.fill(0.0);
                let winner = script[frame].get(evaluations[frame]).copied().unwrap_or(0);
                scores[winner as usize] = 1.0;
                evaluations[frame] += 1;
            },
        );
        (tokens, contexts)
    }

    fn pairs(tokens: &[Token]) -> Vec<(u32, usize)> {
        tokens.iter().map(|token| (token.id, token.frame)).collect()
    }

    #[test]
    fn emits_one_symbol_per_frame_and_always_advances() {
        let (tokens, contexts) = run(CONFIG, &[&[0], &[3, 4], &[0], &[5], &[4]]);
        assert_eq!(pairs(&tokens), [(3, 1), (5, 3), (4, 4)]);
        assert_eq!(
            contexts,
            [
                vec![None, Some(0)],
                vec![Some(0), Some(3)],
                vec![Some(3), Some(5)],
                vec![Some(5), Some(4)]
            ]
        );
    }

    #[test]
    fn unknown_is_skipped_like_blank_and_leaves_the_context_alone() {
        let (tokens, contexts) = run(CONFIG, &[&[2], &[3], &[2], &[4]]);
        assert_eq!(pairs(&tokens), [(3, 1), (4, 3)]);
        assert_eq!(contexts.len(), 3);
        assert_eq!(contexts[2], [Some(3), Some(4)]);
    }

    #[test]
    fn more_symbols_per_frame_stop_at_blank() {
        let config = SearchConfig {
            max_symbols_per_frame: 3,
            ..CONFIG
        };
        let (tokens, _) = run(config, &[&[3, 4, 0], &[5, 5, 5, 5], &[0]]);
        assert_eq!(pairs(&tokens), [(3, 0), (4, 0), (5, 1), (5, 1), (5, 1)]);
    }

    #[test]
    fn empty_input_emits_nothing() {
        let (tokens, contexts) = run(CONFIG, &[]);
        assert!(tokens.is_empty());
        assert_eq!(contexts, [vec![None, Some(0)]]);
    }

    #[test]
    fn argmax_takes_the_first_maximum() {
        assert_eq!(argmax(&[0.0, 2.0, 2.0, 1.0]), 1);
        assert_eq!(argmax(&[-1.0]), 0);
    }

    #[test]
    #[ignore = "needs ZIPFORMER_REF_DIR and ZIPFORMER_GGUF"]
    fn reproduces_reference_tokens_frames_and_logits() {
        let weights = crate::load::Weights::open(&gguf()).unwrap();
        let tokenizer = crate::Tokenizer::load(&weights).unwrap();
        let decoder = Decoder::load(&weights).unwrap();
        let joiner = Joiner::load(&weights).unwrap();
        let config = SearchConfig {
            blank_id: tokenizer.blank_id(),
            unknown_id: tokenizer.unknown_id(),
            context_size: decoder.context_size(),
            max_symbols_per_frame: 1,
        };
        assert_eq!(config, CONFIG);
        assert_eq!((decoder.vocab(), joiner.vocab(), tokenizer.len()), (1493, 1493, 1493));
        for name in CLIPS {
            let dir = clip(name);
            let encoder = Npy::read(&dir.join("encoder_out.npy"));
            assert_eq!(encoder.shape[1], joiner.encoder_dim());
            let reference = Npy::read(&dir.join("logits.npy")).f32();
            let mut logits_error = 0.0f32;
            let tokens = decode(&decoder, &joiner, config, &encoder.f32(), |frame, scores| {
                let expected = &reference[frame * scores.len()..(frame + 1) * scores.len()];
                logits_error = logits_error.max(max_abs_diff(scores, expected));
            });
            let ids = tokens.iter().map(|token| token.id as i32).collect::<Vec<_>>();
            let frames = tokens.iter().map(|token| token.frame as i32).collect::<Vec<_>>();
            let text = tokenizer.decode_clean(&tokens.iter().map(|token| token.id).collect::<Vec<_>>());
            let expected_text = std::fs::read_to_string(dir.join("text.txt")).unwrap();
            let same_ids = ids == Npy::read(&dir.join("tokens.npy")).i32();
            let same_frames = frames == Npy::read(&dir.join("token_frames.npy")).i32();
            let same_text = text == expected_text.trim();
            eprintln!(
                "{name}: frames={} tokens={} ids_match={same_ids} frames_match={same_frames} text_match={same_text} logits max_abs={logits_error:.3e}",
                encoder.shape[0],
                tokens.len()
            );
            assert!(same_ids && same_frames && same_text, "{name}: {text}");
            assert!(logits_error < 1e-4, "{name}: {logits_error}");
        }
    }
}
