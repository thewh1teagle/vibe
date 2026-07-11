use anyhow::{bail, Context as _};
use serde::Serialize;
use whisper_rs::{ContextOptions, Segment, StreamCallbacks, TranscribeOptions, TranscribeResult};

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

pub enum Engine {
    Whisper(whisper_rs::Context),
    Nemotron {
        model: Box<nemotron_rs::Model>,
        vad: Option<(String, vad_rs::Vad)>,
    },
}

impl Engine {
    pub fn requires_vad(&self) -> bool {
        matches!(self, Self::Nemotron { .. })
    }

    pub fn load(path: &str, options: ContextOptions) -> anyhow::Result<Self> {
        if path.ends_with(".gguf") {
            if let Ok(model) = nemotron_rs::Model::load(path) {
                return Ok(Self::Nemotron {
                    model: Box::new(model),
                    vad: None,
                });
            }
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
                Ok(TranscribeResult {
                    segments: result
                        .segments
                        .into_iter()
                        .filter(|segment| !segment.text.is_empty())
                        .map(|segment| Segment {
                            start: segment.tokens.first().map_or(0, |token| token.frame as i64 * 8),
                            end: segment.tokens.last().map_or(0, |token| (token.frame as i64 + 1) * 8),
                            text: segment.text,
                            no_speech_prob: 0.0,
                        })
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
                            if let Some(segment) = nemotron_segment(transcription) {
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
                Ok(TranscribeResult {
                    segments: result.segments.iter().filter_map(nemotron_segment).collect(),
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

fn nemotron_segment(transcription: &nemotron_rs::Transcription) -> Option<Segment> {
    (!transcription.text.is_empty()).then(|| Segment {
        start: transcription.tokens.first().map_or(0, |token| token.frame as i64 * 8),
        end: transcription.tokens.last().map_or(0, |token| (token.frame as i64 + 1) * 8),
        text: transcription.text.clone(),
        no_speech_prob: 0.0,
    })
}
