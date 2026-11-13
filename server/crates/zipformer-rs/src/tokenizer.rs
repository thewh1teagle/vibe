use crate::load::Weights;
use crate::{Error, Result};

const WORD_START: char = '\u{2581}';

/// The SentencePiece unigram vocabulary stored in the GGUF. Decoding is plain
/// concatenation: a piece opening with U+2581 starts a word, punctuation is a
/// piece of its own that attaches to the word before it.
#[derive(Debug, Clone)]
pub struct Tokenizer {
    tokens: Vec<String>,
    blank_id: u32,
    unknown_id: u32,
    control_ids: Vec<u32>,
}

impl Tokenizer {
    pub(crate) fn load(weights: &Weights) -> Result<Self> {
        let model = weights.meta_str("tokenizer.ggml.model")?;
        if model != "unigram" && model != "bpe" {
            return Err(Error::InvalidMetadata {
                key: "tokenizer.ggml.model",
                message: format!("unsupported tokenizer {model:?}"),
            });
        }
        let tokens = weights.meta_strs("tokenizer.ggml.tokens")?;
        let blank_id = weights.meta_u32("tokenizer.ggml.blank_token_id")?;
        let unknown_id = weights.meta_u32("tokenizer.ggml.unknown_token_id")?;
        let mut control_ids = vec![blank_id, unknown_id];
        for key in ["tokenizer.ggml.bos_token_id", "tokenizer.ggml.eos_token_id"] {
            control_ids.extend(weights.meta_u32(key).ok());
        }
        Self::new(tokens, blank_id, unknown_id, control_ids)
    }

    pub(crate) fn new(tokens: Vec<String>, blank_id: u32, unknown_id: u32, control_ids: Vec<u32>) -> Result<Self> {
        for (key, id) in [
            ("tokenizer.ggml.blank_token_id", blank_id),
            ("tokenizer.ggml.unknown_token_id", unknown_id),
        ] {
            if id as usize >= tokens.len() {
                return Err(Error::InvalidMetadata {
                    key,
                    message: format!("{id} is outside the {}-piece vocabulary", tokens.len()),
                });
            }
        }
        Ok(Self {
            tokens,
            blank_id,
            unknown_id,
            control_ids,
        })
    }

    pub fn len(&self) -> usize {
        self.tokens.len()
    }
    pub fn is_empty(&self) -> bool {
        self.tokens.is_empty()
    }
    pub fn blank_id(&self) -> u32 {
        self.blank_id
    }
    pub fn unknown_id(&self) -> u32 {
        self.unknown_id
    }
    pub fn piece(&self, id: u32) -> Option<&str> {
        self.tokens.get(id as usize).map(String::as_str)
    }

    /// Blank, unknown and sentence-boundary ids: they carry no text.
    pub fn is_control(&self, id: u32) -> bool {
        self.control_ids.contains(&id)
    }

    /// Whether `id` opens a new word, for grouping pieces into word timings.
    pub fn starts_word(&self, id: u32) -> bool {
        !self.is_control(id) && self.piece(id).is_some_and(|piece| piece.starts_with(WORD_START))
    }

    /// Concatenates the pieces with U+2581 turned into a space; a leading
    /// word keeps its leading space.
    pub fn decode(&self, ids: &[u32]) -> String {
        let mut text = String::with_capacity(ids.len() * 6);
        for &id in ids {
            if self.is_control(id) {
                continue;
            }
            let Some(piece) = self.piece(id) else { continue };
            text.extend(piece.chars().map(|c| if c == WORD_START { ' ' } else { c }));
        }
        text
    }

    pub fn decode_clean(&self, ids: &[u32]) -> String {
        self.decode(ids).trim().to_owned()
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn hebrew() -> Tokenizer {
        let pieces = [
            "<blk>",
            "<sos/eos>",
            "<unk>",
            "▁של",
            "ום",
            "▁ל",
            "כול",
            "ם",
            ",",
            "▁היום",
            ".",
            "?",
            "▁OK",
        ];
        Tokenizer::new(pieces.iter().map(|piece| piece.to_string()).collect(), 0, 2, vec![0, 2, 1, 1]).unwrap()
    }

    #[test]
    fn joins_pieces_into_words_and_attaches_punctuation() {
        let tokenizer = hebrew();
        assert_eq!(tokenizer.decode(&[3, 4, 5, 6, 7, 8, 9, 10]), " שלום לכולם, היום.");
        assert_eq!(tokenizer.decode_clean(&[3, 4, 5, 6, 7, 8, 9, 10]), "שלום לכולם, היום.");
        assert_eq!(tokenizer.decode_clean(&[]), "");
    }

    #[test]
    fn control_pieces_and_unknown_ids_carry_no_text() {
        let tokenizer = hebrew();
        assert_eq!(tokenizer.decode_clean(&[0, 3, 1, 4, 2, 999]), "שלום");
        assert!(tokenizer.is_control(1));
        assert!(!tokenizer.is_control(3));
    }

    #[test]
    fn word_starts_follow_the_marker() {
        let tokenizer = hebrew();
        let starts = [3, 4, 5, 6, 7, 8, 9, 10].map(|id| tokenizer.starts_word(id));
        assert_eq!(starts, [true, false, true, false, false, false, true, false]);
        assert!(!tokenizer.starts_word(0));
        assert!(!tokenizer.starts_word(999));
    }

    #[test]
    fn rejects_special_ids_outside_the_vocabulary() {
        assert!(Tokenizer::new(vec!["a".into()], 1, 0, Vec::new()).is_err());
    }
}
