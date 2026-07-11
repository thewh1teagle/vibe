use std::ffi::{CStr, CString};

use crate::{sys, Error, Result};

#[derive(Debug, Clone)]
pub struct Tokenizer {
    tokens: Vec<String>,
    blank_id: u32,
    unknown_id: u32,
}

impl Tokenizer {
    pub(crate) unsafe fn load(ctx: *const sys::gguf_context) -> Result<Self> {
        let model = string(ctx, "tokenizer.ggml.model")?;
        if model != "bpe" && model != "unigram" {
            return Err(Error::InvalidMetadata {
                key: "tokenizer.ggml.model",
                message: format!("unsupported tokenizer {model:?}"),
            });
        }
        Ok(Self {
            tokens: strings(ctx, "tokenizer.ggml.tokens")?,
            blank_id: uint(ctx, "tokenizer.ggml.blank_token_id")?,
            unknown_id: uint(ctx, "tokenizer.ggml.unknown_token_id")?,
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

    pub fn decode(&self, ids: &[u32]) -> String {
        let mut bytes = Vec::with_capacity(ids.len() * 4);
        for &id in ids {
            let Some(piece) = self.piece(id) else { continue };
            if let Some(byte) = byte_fallback(piece) {
                bytes.push(byte);
                continue;
            }
            let mut rest = piece.as_bytes();
            while let Some(position) = rest.windows(3).position(|window| window == "▁".as_bytes()) {
                bytes.extend_from_slice(&rest[..position]);
                bytes.push(b' ');
                rest = &rest[position + 3..];
            }
            bytes.extend_from_slice(rest);
        }
        String::from_utf8_lossy(&bytes).into_owned()
    }

    pub fn decode_clean(&self, ids: &[u32]) -> String {
        let filtered = ids
            .iter()
            .copied()
            .filter(|&id| {
                self.piece(id)
                    .is_none_or(|piece| !(piece.starts_with('<') && piece.ends_with('>') && piece.contains('-')))
            })
            .collect::<Vec<_>>();
        self.decode(&filtered).trim().to_owned()
    }
}

fn byte_fallback(piece: &str) -> Option<u8> {
    let hex = piece.strip_prefix("<0x")?.strip_suffix('>')?;
    (hex.len() == 2).then(|| u8::from_str_radix(hex, 16).ok()).flatten()
}

unsafe fn id(ctx: *const sys::gguf_context, key: &'static str) -> Result<i64> {
    let key_c = CString::new(key).unwrap();
    let id = sys::gguf_find_key(ctx, key_c.as_ptr());
    (id >= 0).then_some(id).ok_or(Error::MissingMetadata(key))
}

unsafe fn string(ctx: *const sys::gguf_context, key: &'static str) -> Result<String> {
    let value = sys::gguf_get_val_str(ctx, id(ctx, key)?);
    if value.is_null() {
        return Err(Error::InvalidMetadata {
            key,
            message: "null string".into(),
        });
    }
    Ok(CStr::from_ptr(value).to_string_lossy().into_owned())
}

unsafe fn strings(ctx: *const sys::gguf_context, key: &'static str) -> Result<Vec<String>> {
    let id = id(ctx, key)?;
    (0..sys::gguf_get_arr_n(ctx, id))
        .map(|index| {
            let value = sys::gguf_get_arr_str(ctx, id, index);
            if value.is_null() {
                Err(Error::InvalidMetadata {
                    key,
                    message: format!("null string at {index}"),
                })
            } else {
                Ok(CStr::from_ptr(value).to_string_lossy().into_owned())
            }
        })
        .collect()
}

unsafe fn uint(ctx: *const sys::gguf_context, key: &'static str) -> Result<u32> {
    Ok(sys::gguf_get_val_u32(ctx, id(ctx, key)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_sentencepiece_and_byte_fallback() {
        let tokenizer = Tokenizer {
            tokens: vec!["▁hi".into(), "<0xE2>".into(), "<0x82>".into(), "<0xAC>".into()],
            blank_id: 4,
            unknown_id: 0,
        };
        assert_eq!(tokenizer.decode(&[0, 1, 2, 3]), " hi€");
    }
}
