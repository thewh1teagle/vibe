use core::fmt;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Clone)]
#[cfg_attr(feature = "server", derive(utoipa::ToSchema))]

pub struct TranscribeOptions {
    pub path: String,
    pub instant_transcribe_frequency: Option<i64>,
    pub lang: Option<String>,
    pub verbose: Option<bool>,

    pub n_threads: Option<i32>,
    pub init_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub translate: Option<bool>,
    pub max_text_ctx: Option<i32>,
    pub word_timestamps: Option<bool>,
    pub max_sentence_len: Option<i32>,
}

impl fmt::Debug for TranscribeOptions {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let json_string = serde_json::to_string_pretty(self).map_err(|_| fmt::Error)?;
        write!(f, "{}", json_string)
    }
}
