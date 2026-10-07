use anyhow::{bail, Context as _};
use serde::Serialize;
use whisper_rs::{ContextOptions, Segment, StreamCallbacks, TranscribeOptions, TranscribeResult, Word};

/// Centiseconds per encoder frame of the Parakeet and Nemotron FastConformers (80 ms).
const FRAME_CS: i64 = 8;

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct EngineCapabilities {
    pub engine: String,
    pub requires_vad: bool,
    pub languages: Vec<String>,
    pub language_detection: bool,
    pub streaming: bool,
    pub translation: bool,
    pub timestamps: bool,
    pub text_prompts: bool,
}

// One engine lives at a time, so the size gap between variants costs nothing.
#[allow(clippy::large_enum_variant)]
pub enum Engine {
    Whisper(whisper_rs::Context),
    Nemotron {
        model: Box<nemotron_rs::Model>,
        vad: Option<(String, vad_rs::Vad)>,
    },
    Parakeet {
        model: Box<parakeet_rs::Model>,
        vad: Option<(String, vad_rs::Vad)>,
    },
}

impl Engine {
    pub fn requires_vad(&self) -> bool {
        matches!(self, Self::Nemotron { .. } | Self::Parakeet { .. })
    }

    pub fn load(path: &str, options: ContextOptions) -> anyhow::Result<Self> {
        if path.ends_with(".gguf") {
            if let Ok(info) = parakeet_rs::Model::metadata(path) {
                if info.architecture == "parakeet" && info.variant.contains("v3") {
                    return Ok(Self::Parakeet {
                        model: Box::new(parakeet_rs::Model::load(path)?),
                        vad: None,
                    });
                }
            }
            // A GGUF file is never a whisper model, so report why the GGUF
            // engines rejected it instead of handing it to whisper.cpp.
            let model = nemotron_rs::Model::load(path).context("GGUF file could not be loaded as Parakeet or Nemotron")?;
            return Ok(Self::Nemotron {
                model: Box::new(model),
                vad: None,
            });
        }
        Ok(Self::Whisper(whisper_rs::Context::new(path, options)?))
    }

    pub fn transcribe(&mut self, samples: &[f32], options: TranscribeOptions) -> anyhow::Result<TranscribeResult> {
        match self {
            Self::Whisper(context) => context.transcribe(samples, options).map_err(Into::into),
            Self::Nemotron { model, vad } => {
                if options.translate {
                    bail!("Nemotron does not support translation");
                }
                if options.prompt.is_some() {
                    bail!("Nemotron does not support text prompts");
                }
                let language = if options.detect_language {
                    "auto"
                } else {
                    options.language.as_deref().unwrap_or("en-US")
                };
                let vad_model_path = options
                    .vad_model_path
                    .as_deref()
                    .context("vad_model_path is required for Nemotron")?;
                if vad.as_ref().is_none_or(|(path, _)| path != vad_model_path) {
                    *vad = Some((
                        vad_model_path.to_string(),
                        vad_rs::Vad::new(vad_model_path, vad_rs::Options::default())?,
                    ));
                }
                let result = model
                    .transcribe(&mut vad.as_mut().unwrap().1, samples, language)
                    .context("Nemotron inference failed")?;
                let tokenizer = model.tokenizer();
                Ok(TranscribeResult {
                    segments: result
                        .segments
                        .iter()
                        .filter_map(|segment| nemotron_segment(segment, tokenizer))
                        .collect(),
                })
            }
            Self::Parakeet { model, vad } => {
                validate_parakeet_options(&options)?;
                let language = if options.detect_language {
                    "auto"
                } else {
                    options.language.as_deref().unwrap_or("en")
                };
                let vad = parakeet_vad(vad, options.vad_model_path.as_deref())?;
                let result = model
                    .transcribe(vad, samples, language)
                    .context("Parakeet inference failed")?;
                let tokenizer = model.tokenizer();
                Ok(TranscribeResult {
                    segments: result
                        .segments
                        .iter()
                        .filter_map(|segment| parakeet_segment(segment, tokenizer))
                        .collect(),
                })
            }
        }
    }

    pub fn transcribe_stream(
        &mut self,
        samples: &[f32],
        options: TranscribeOptions,
        callbacks: StreamCallbacks<'_>,
    ) -> anyhow::Result<TranscribeResult> {
        match self {
            Self::Whisper(context) => context.transcribe_stream(samples, options, callbacks).map_err(Into::into),
            Self::Nemotron { model, vad } => {
                if options.translate {
                    bail!("Nemotron does not support translation");
                }
                if options.prompt.is_some() {
                    bail!("Nemotron does not support text prompts");
                }
                let language = if options.detect_language {
                    "auto"
                } else {
                    options.language.as_deref().unwrap_or("en-US")
                };
                let vad_model_path = options
                    .vad_model_path
                    .as_deref()
                    .context("vad_model_path is required for Nemotron")?;
                if vad.as_ref().is_none_or(|(path, _)| path != vad_model_path) {
                    *vad = Some((
                        vad_model_path.to_string(),
                        vad_rs::Vad::new(vad_model_path, vad_rs::Options::default())?,
                    ));
                }
                let StreamCallbacks {
                    mut on_progress,
                    mut on_segment,
                    mut should_abort,
                } = callbacks;
                let result = model.transcribe_with(
                    &mut vad.as_mut().unwrap().1,
                    samples,
                    language,
                    || should_abort.as_mut().is_some_and(|callback| callback()),
                    |transcription| {
                        if let Some(callback) = on_segment.as_mut() {
                            if let Some(segment) = nemotron_segment(transcription, model.tokenizer()) {
                                callback(segment);
                            }
                        }
                    },
                    |progress| {
                        if let Some(callback) = on_progress.as_mut() {
                            callback(progress);
                        }
                    },
                )?;
                let tokenizer = model.tokenizer();
                Ok(TranscribeResult {
                    segments: result
                        .segments
                        .iter()
                        .filter_map(|segment| nemotron_segment(segment, tokenizer))
                        .collect(),
                })
            }
            Self::Parakeet { model, vad } => {
                validate_parakeet_options(&options)?;
                let language = if options.detect_language {
                    "auto"
                } else {
                    options.language.as_deref().unwrap_or("en")
                };
                let vad = parakeet_vad(vad, options.vad_model_path.as_deref())?;
                let StreamCallbacks {
                    mut on_progress,
                    mut on_segment,
                    mut should_abort,
                } = callbacks;
                let result = model
                    .transcribe_with(
                        vad,
                        samples,
                        language,
                        || should_abort.as_mut().is_some_and(|callback| callback()),
                        |transcription| {
                            if let (Some(callback), Some(segment)) =
                                (on_segment.as_mut(), parakeet_segment(transcription, model.tokenizer()))
                            {
                                callback(segment);
                            }
                        },
                        |progress| {
                            if let Some(callback) = on_progress.as_mut() {
                                callback(progress);
                            }
                        },
                    )
                    .context("Parakeet inference failed")?;
                let tokenizer = model.tokenizer();
                Ok(TranscribeResult {
                    segments: result
                        .segments
                        .iter()
                        .filter_map(|segment| parakeet_segment(segment, tokenizer))
                        .collect(),
                })
            }
        }
    }

    pub fn capabilities(&self) -> EngineCapabilities {
        match self {
            Self::Whisper(_) => whisper_capabilities(),
            Self::Nemotron { model, .. } => EngineCapabilities {
                engine: "nemotron".to_string(),
                requires_vad: true,
                languages: model.info().languages.clone(),
                language_detection: model.info().language_detection,
                streaming: false,
                translation: false,
                timestamps: true,
                text_prompts: false,
            },
            Self::Parakeet { model, .. } => EngineCapabilities {
                engine: "parakeet".to_string(),
                requires_vad: true,
                languages: model.info().languages.clone(),
                language_detection: model.info().language_detection,
                streaming: false,
                translation: false,
                timestamps: true,
                text_prompts: false,
            },
        }
    }
}

pub fn whisper_capabilities() -> EngineCapabilities {
    EngineCapabilities {
        engine: "whisper".to_string(),
        requires_vad: false,
        languages: whisper_rs::supported_languages(),
        language_detection: true,
        streaming: true,
        translation: true,
        timestamps: true,
        text_prompts: true,
    }
}

fn nemotron_segment(transcription: &nemotron_rs::Transcription, tokenizer: &nemotron_rs::Tokenizer) -> Option<Segment> {
    // Nemotron emits a token's start frame only; it ends with its frame.
    let tokens = transcription
        .tokens
        .iter()
        .map(|token| (token.id, token.frame as i64 * FRAME_CS, (token.frame as i64 + 1) * FRAME_CS))
        .collect::<Vec<_>>();
    (!transcription.text.is_empty()).then(|| Segment {
        start: tokens.first().map_or(0, |token| token.1),
        end: tokens.last().map_or(0, |token| token.2),
        text: transcription.text.clone(),
        no_speech_prob: 0.0,
        words: piece_words(&tokens, |id| tokenizer.piece(id), |ids| tokenizer.decode(ids)),
    })
}

fn validate_parakeet_options(options: &TranscribeOptions) -> anyhow::Result<()> {
    if options.translate {
        bail!("Parakeet does not support translation");
    }
    if options.prompt.is_some() {
        bail!("Parakeet does not support text prompts");
    }
    Ok(())
}

fn parakeet_vad<'a>(cached: &'a mut Option<(String, vad_rs::Vad)>, path: Option<&str>) -> anyhow::Result<&'a mut vad_rs::Vad> {
    let path = path.context("vad_model_path is required for Parakeet")?;
    if cached.as_ref().is_none_or(|(cached_path, _)| cached_path != path) {
        *cached = Some((path.to_owned(), vad_rs::Vad::new(path, vad_rs::Options::default())?));
    }
    Ok(&mut cached.as_mut().expect("VAD initialized").1)
}

fn parakeet_segment(transcription: &parakeet_rs::Transcription, tokenizer: &parakeet_rs::Tokenizer) -> Option<Segment> {
    let tokens = transcription
        .tokens
        .iter()
        .map(|token| {
            let start = token.frame as i64 * FRAME_CS;
            (token.id, start, start + token.duration_frames.max(1) as i64 * FRAME_CS)
        })
        .collect::<Vec<_>>();
    (!transcription.text.is_empty()).then(|| Segment {
        start: tokens.first().map_or(0, |token| token.1),
        end: tokens.last().map_or(0, |token| token.2),
        text: transcription.text.clone(),
        no_speech_prob: 0.0,
        words: piece_words(&tokens, |id| tokenizer.piece(id), |ids| tokenizer.decode(ids)),
    })
}

/// Groups SentencePiece tokens `(id, start_cs, end_cs)` into words: a piece
/// opening with `▁` starts one. Control pieces such as `<en-US>` are dropped,
/// as `decode_clean` drops them from the segment text.
fn piece_words<'a>(
    tokens: &[(u32, i64, i64)],
    piece: impl Fn(u32) -> Option<&'a str>,
    decode: impl Fn(&[u32]) -> String,
) -> Vec<Word> {
    let mut words = Vec::new();
    let mut ids = Vec::new();
    let (mut start, mut end) = (0, 0);
    let mut flush = |ids: &mut Vec<u32>, start: i64, end: i64| {
        if !ids.is_empty() {
            words.push(Word {
                start,
                end,
                text: decode(ids),
            });
            ids.clear();
        }
    };
    for &(id, token_start, token_end) in tokens {
        let text = piece(id).unwrap_or_default();
        if text.starts_with('<') && text.ends_with('>') && text.contains('-') {
            continue;
        }
        if text.starts_with('▁') || ids.is_empty() {
            flush(&mut ids, start, end);
            start = token_start;
        }
        ids.push(id);
        end = token_end;
    }
    flush(&mut ids, start, end);
    words
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pieces_group_into_words_with_their_times() {
        let pieces = ["<en-US>", "▁Hel", "lo", "▁world", "."];
        let tokens = [(0, 0, 8), (1, 8, 16), (2, 16, 24), (3, 40, 48), (4, 48, 56)];
        let decode = |ids: &[u32]| {
            ids.iter()
                .map(|&id| pieces[id as usize].replace('▁', " "))
                .collect::<String>()
        };
        let words = piece_words(&tokens, |id| pieces.get(id as usize).copied(), decode);
        let spans = words.iter().map(|w| (w.text.as_str(), w.start, w.end)).collect::<Vec<_>>();
        assert_eq!(spans, [(" Hello", 8, 24), (" world.", 40, 56)]);
    }
}
