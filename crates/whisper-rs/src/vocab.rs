//! The whisper vocabulary: token tables, special-token ids and the greedy
//! prompt tokenizer, ported from whisper.cpp (`whisper_vocab`, `tokenize`).

use std::collections::HashMap;

use crate::lang;

pub type Token = i32;

pub struct Vocab {
    pub n_vocab: i32,
    pub token_to_id: HashMap<Vec<u8>, Token>,
    pub id_to_token: Vec<Vec<u8>>,

    pub token_eot: Token,
    pub token_sot: Token,
    pub token_translate: Token,
    pub token_transcribe: Token,
    pub token_solm: Token,
    pub token_prev: Token,
    pub token_nosp: Token,
    pub token_not: Token,
    pub token_beg: Token,
}

impl Vocab {
    /// Build the vocab from the words read out of the model file, mirroring
    /// the special-token arithmetic in `whisper_model_load`.
    pub fn new(mut words: Vec<Vec<u8>>, n_vocab: i32) -> Self {
        // Base ids for the English-only models.
        let mut token_eot: Token = 50256;
        let mut token_sot: Token = 50257;
        let mut token_translate: Token = 50357;
        let mut token_transcribe: Token = 50358;
        let mut token_solm: Token = 50359;
        let mut token_prev: Token = 50360;
        let mut token_nosp: Token = 50361;
        let mut token_not: Token = 50362;
        let mut token_beg: Token = 50363;

        let is_multilingual = n_vocab >= 51865;
        let num_languages = n_vocab - 51765 - if is_multilingual { 1 } else { 0 };
        if is_multilingual {
            token_eot += 1;
            token_sot += 1;
            let dt = num_languages - 98;
            token_translate += dt;
            token_transcribe += dt;
            token_solm += dt;
            token_prev += dt;
            token_nosp += dt;
            token_not += dt;
            token_beg += dt;
        }

        // Synthesize printable names for ids past the stored vocab, exactly
        // like whisper.cpp does, so token_to_str works for special tokens.
        let n_stored = words.len() as i32;
        for i in n_stored..n_vocab {
            let word: String = if i > token_beg {
                format!("[_TT_{}]", i - token_beg)
            } else if i == token_eot {
                "[_EOT_]".to_string()
            } else if i == token_sot {
                "[_SOT_]".to_string()
            } else if i == token_translate {
                "[_TRANSLATE_]".to_string()
            } else if i == token_transcribe {
                "[_TRANSCRIBE_]".to_string()
            } else if i == token_solm {
                "[_SOLM_]".to_string()
            } else if i == token_prev {
                "[_PREV_]".to_string()
            } else if i == token_nosp {
                "[_NOSP_]".to_string()
            } else if i == token_not {
                "[_NOT_]".to_string()
            } else if i == token_beg {
                "[_BEG_]".to_string()
            } else if i > token_sot && i <= token_sot + num_languages {
                match lang::lang_str((i - token_sot - 1) as usize) {
                    Some(code) => format!("[_LANG_{code}]"),
                    None => format!("[_extra_token_{i}]"),
                }
            } else {
                format!("[_extra_token_{i}]")
            };
            words.push(word.into_bytes());
        }

        let mut token_to_id = HashMap::with_capacity(words.len());
        for (id, word) in words.iter().enumerate() {
            token_to_id.insert(word.clone(), id as Token);
        }

        Self {
            n_vocab,
            token_to_id,
            id_to_token: words,
            token_eot,
            token_sot,
            token_translate,
            token_transcribe,
            token_solm,
            token_prev,
            token_nosp,
            token_not,
            token_beg,
        }
    }

    pub fn is_multilingual(&self) -> bool {
        self.n_vocab >= 51865
    }

    #[allow(dead_code)]
    pub fn num_languages(&self) -> i32 {
        self.n_vocab - 51765 - if self.is_multilingual() { 1 } else { 0 }
    }

    /// `whisper_token_lang`.
    pub fn token_lang(&self, lang_id: usize) -> Token {
        self.token_sot + 1 + lang_id as Token
    }

    pub fn token_bytes(&self, id: Token) -> &[u8] {
        static EMPTY: &[u8] = &[];
        self.id_to_token.get(id as usize).map(|w| w.as_slice()).unwrap_or(EMPTY)
    }

    pub fn token_str(&self, id: Token) -> String {
        String::from_utf8_lossy(self.token_bytes(id)).into_owned()
    }

    pub fn id_for(&self, text: &str) -> Option<Token> {
        self.token_to_id.get(text.as_bytes()).copied()
    }

    /// Port of whisper.cpp `tokenize`: split with the GPT-2 pattern (ASCII
    /// character classes, like `std::regex` in the C locale), then greedily
    /// take the longest vocabulary substring of each word.
    pub fn tokenize(&self, text: &str) -> Vec<Token> {
        let words = split_words(text.as_bytes());

        let mut tokens = Vec::new();
        for word in words {
            if word.is_empty() {
                continue;
            }
            let mut i = 0;
            let n = word.len();
            while i < n {
                let mut j = n;
                let mut found = false;
                while j > i {
                    if let Some(&id) = self.token_to_id.get(&word[i..j]) {
                        tokens.push(id);
                        i = j;
                        found = true;
                        break;
                    }
                    j -= 1;
                }
                if !found {
                    tracing::error!("unknown token");
                    i += 1;
                }
            }
        }
        tokens
    }
}

/// Hand-rolled scanner for the GPT-2 split regex used by whisper.cpp:
/// `'s|'t|'re|'ve|'m|'ll|'d| ?[[:alpha:]]+| ?[[:digit:]]+| ?[^\s[:alpha:][:digit:]]+|\s+(?!\S)|\s+`
/// with ASCII-only character classes (the C++ std::regex runs in the C locale).
fn split_words(bytes: &[u8]) -> Vec<Vec<u8>> {
    const CONTRACTIONS: [&[u8]; 7] = [b"'s", b"'t", b"'re", b"'ve", b"'m", b"'ll", b"'d"];
    let is_alpha = |b: u8| b.is_ascii_alphabetic();
    let is_digit = |b: u8| b.is_ascii_digit();
    let is_space = |b: u8| b == b' ' || (0x09..=0x0d).contains(&b);

    let mut words = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        // Contractions first, in alternation order.
        if bytes[i] == b'\'' {
            if let Some(m) = CONTRACTIONS
                .iter()
                .find(|c| bytes[i..].starts_with(c))
            {
                words.push(m.to_vec());
                i += m.len();
                continue;
            }
        }

        let lead_space = usize::from(bytes[i] == b' ' && i + 1 < bytes.len());
        let next = bytes.get(i + lead_space).copied();

        if let Some(b) = next {
            if is_alpha(b) {
                let mut j = i + lead_space;
                while j < bytes.len() && is_alpha(bytes[j]) {
                    j += 1;
                }
                words.push(bytes[i..j].to_vec());
                i = j;
                continue;
            }
            if is_digit(b) {
                let mut j = i + lead_space;
                while j < bytes.len() && is_digit(bytes[j]) {
                    j += 1;
                }
                words.push(bytes[i..j].to_vec());
                i = j;
                continue;
            }
            if !is_space(b) {
                // ` ?[^\s[:alpha:][:digit:]]+`, but stop before a contraction
                // could match: the regex alternation prefers earlier branches
                // at each new match position, and matches are found leftmost.
                let mut j = i + lead_space;
                while j < bytes.len() && !is_space(bytes[j]) && !is_alpha(bytes[j]) && !is_digit(bytes[j]) {
                    j += 1;
                }
                words.push(bytes[i..j].to_vec());
                i = j;
                continue;
            }
        }

        // `\s+` (the `(?!\S)` lookahead variant collapses to the same greedy
        // run for our purposes).
        let mut j = i;
        while j < bytes.len() && is_space(bytes[j]) {
            j += 1;
        }
        words.push(bytes[i..j].to_vec());
        i = j;
    }
    words
}
