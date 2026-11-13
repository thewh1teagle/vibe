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
    Zipformer {
        model: Box<zipformer_rs::Model>,
        vad: Option<(String, vad_rs::Vad)>,
    },
}

/// The engine a GGUF file belongs to, decided from its metadata alone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GgufModel {
    Nemotron,
    Parakeet,
    Zipformer,
}

/// Whether the file starts with the GGUF magic. Whisper models use the older
/// GGML container and are handled by whisper.cpp instead.
pub fn is_gguf(path: &str) -> bool {
    use std::io::Read;

    let mut magic = [0u8; 4];
    std::fs::File::open(path).is_ok_and(|mut file| file.read_exact(&mut magic).is_ok()) && &magic == b"GGUF"
}

/// Identifies a GGUF model by `general.architecture` and its head, without
/// loading tensor data: `zipformer2` is Zipformer, `parakeet` is Parakeet
/// (TDT v3) or Nemotron (RNN-T).
pub fn probe_gguf(path: &str) -> anyhow::Result<(GgufModel, EngineCapabilities)> {
    let architecture = match zipformer_rs::Model::metadata(path) {
        Ok(info) => {
            return Ok((
                GgufModel::Zipformer,
                gguf_capabilities("zipformer", info.languages, info.language_detection),
            ));
        }
        Err(zipformer_rs::Error::UnsupportedArchitecture(architecture)) => architecture,
        Err(err) => return Err(err).context("failed to read GGUF metadata"),
    };
    if architecture != "parakeet" {
        bail!("unsupported GGUF architecture '{architecture}'; expected parakeet or zipformer2");
    }
    if let Ok(info) = parakeet_rs::Model::metadata(path) {
        if info.head_kind == "tdt" && info.variant.contains("v3") {
            return Ok((
                GgufModel::Parakeet,
                gguf_capabilities("parakeet", info.languages, info.language_detection),
            ));
        }
    }
    let info = nemotron_rs::Model::metadata(path).context("failed to read GGUF metadata")?;
    if info.head_kind != "rnnt" {
        bail!(
            "unsupported GGUF model: architecture '{}', variant '{}', head '{}'",
            info.architecture,
            info.variant,
            info.head_kind
        );
    }
    Ok((
        GgufModel::Nemotron,
        gguf_capabilities("nemotron", info.languages, info.language_detection),
    ))
}

impl Engine {
    pub fn requires_vad(&self) -> bool {
        !matches!(self, Self::Whisper(_))
    }

    pub fn load(path: &str, options: ContextOptions) -> anyhow::Result<Self> {
        // A GGUF file is never a whisper model, so report why the GGUF
        // engines rejected it instead of handing it to whisper.cpp.
        if !path.ends_with(".gguf") && !is_gguf(path) {
            return Ok(Self::Whisper(whisper_rs::Context::new(path, options)?));
        }
        Ok(match probe_gguf(path)?.0 {
            GgufModel::Nemotron => Self::Nemotron {
                model: Box::new(nemotron_rs::Model::load(path)?),
                vad: None,
            },
            GgufModel::Parakeet => Self::Parakeet {
                model: Box::new(parakeet_rs::Model::load(path)?),
                vad: None,
            },
            GgufModel::Zipformer => Self::Zipformer {
                model: Box::new(zipformer_rs::Model::load_with(path, !options.no_gpu)?),
                vad: None,
            },
        })
    }

    pub fn transcribe(&mut self, samples: &[f32], options: TranscribeOptions) -> anyhow::Result<TranscribeResult> {
        self.transcribe_stream(samples, options, StreamCallbacks::default())
    }

    pub fn transcribe_stream(
        &mut self,
        samples: &[f32],
        options: TranscribeOptions,
        callbacks: StreamCallbacks<'_>,
    ) -> anyhow::Result<TranscribeResult> {
        let mut result = match self {
            Self::Whisper(context) => return context.transcribe_stream(samples, options, callbacks).map_err(Into::into),
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
                        vad_rs::Vad::new(vad_model_path, vad_rs::Options::regions())?,
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
                TranscribeResult {
                    segments: result
                        .segments
                        .iter()
                        .filter_map(|segment| nemotron_segment(segment, tokenizer))
                        .collect(),
                }
            }
            Self::Parakeet { model, vad } => {
                validate_parakeet_options(&options)?;
                let language = if options.detect_language {
                    "auto"
                } else {
                    options.language.as_deref().unwrap_or("en")
                };
                let vad = region_vad(vad, options.vad_model_path.as_deref(), "Parakeet")?;
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
                TranscribeResult {
                    segments: result
                        .segments
                        .iter()
                        .filter_map(|segment| parakeet_segment(segment, tokenizer))
                        .collect(),
                }
            }
            Self::Zipformer { model, vad } => zipformer_transcribe(model, vad, samples, options, callbacks)?,
        };
        // These engines trim each sentence, where a whisper segment opens with
        // its own space; `TranscribeResult::text` joins on that space.
        for segment in result.segments.iter_mut().skip(1) {
            segment.text.insert(0, ' ');
        }
        Ok(result)
    }

    pub fn capabilities(&self) -> EngineCapabilities {
        match self {
            Self::Whisper(_) => whisper_capabilities(),
            Self::Nemotron { model, .. } => {
                gguf_capabilities("nemotron", model.info().languages.clone(), model.info().language_detection)
            }
            Self::Parakeet { model, .. } => {
                gguf_capabilities("parakeet", model.info().languages.clone(), model.info().language_detection)
            }
            Self::Zipformer { model, .. } => {
                gguf_capabilities("zipformer", model.info().languages.clone(), model.info().language_detection)
            }
        }
    }
}

/// The GGUF engines share one shape: each transcribes VAD regions on its own,
/// in the model's own languages, with no translation and no prompt.
fn gguf_capabilities(engine: &str, languages: Vec<String>, language_detection: bool) -> EngineCapabilities {
    EngineCapabilities {
        engine: engine.to_string(),
        requires_vad: true,
        languages,
        language_detection,
        streaming: false,
        translation: false,
        timestamps: true,
        text_prompts: false,
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

fn region_vad<'a>(
    cached: &'a mut Option<(String, vad_rs::Vad)>,
    path: Option<&str>,
    engine: &str,
) -> anyhow::Result<&'a mut vad_rs::Vad> {
    let path = path.with_context(|| format!("vad_model_path is required for {engine}"))?;
    if cached.as_ref().is_none_or(|(cached_path, _)| cached_path != path) {
        *cached = Some((path.to_owned(), vad_rs::Vad::new(path, vad_rs::Options::regions())?));
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

fn zipformer_transcribe(
    model: &zipformer_rs::Model,
    vad: &mut Option<(String, vad_rs::Vad)>,
    samples: &[f32],
    options: TranscribeOptions,
    callbacks: StreamCallbacks<'_>,
) -> anyhow::Result<TranscribeResult> {
    if options.translate {
        bail!("Zipformer does not support translation");
    }
    if options.prompt.is_some() {
        bail!("Zipformer does not support text prompts");
    }
    let language = if options.detect_language {
        "auto"
    } else {
        options.language.as_deref().unwrap_or("auto")
    };
    let vad = region_vad(vad, options.vad_model_path.as_deref(), "Zipformer")?;
    let StreamCallbacks {
        mut on_progress,
        mut on_segment,
        mut should_abort,
    } = callbacks;
    let (tokenizer, frame_seconds) = (model.tokenizer(), model.info().frame_seconds);
    let result = model
        .transcribe_with(
            vad,
            samples,
            language,
            || should_abort.as_mut().is_some_and(|callback| callback()),
            |transcription| {
                if let (Some(callback), Some(segment)) = (
                    on_segment.as_mut(),
                    zipformer_segment(transcription, tokenizer, frame_seconds),
                ) {
                    callback(segment);
                }
            },
            |progress| {
                if let Some(callback) = on_progress.as_mut() {
                    callback(progress);
                }
            },
        )
        .map_err(|err| anyhow::anyhow!("Zipformer inference failed: {err}"))?;
    Ok(TranscribeResult {
        segments: result
            .segments
            .iter()
            .filter_map(|segment| zipformer_segment(segment, tokenizer, frame_seconds))
            .collect(),
    })
}

fn zipformer_segment(
    transcription: &zipformer_rs::Transcription,
    tokenizer: &zipformer_rs::Tokenizer,
    frame_seconds: f32,
) -> Option<Segment> {
    let tokens = frame_spans(
        transcription
            .tokens
            .iter()
            .map(|token| (token.id, token.frame, token.duration_frames)),
        frame_seconds,
    );
    (!transcription.text.is_empty()).then(|| Segment {
        start: tokens.first().map_or(0, |token| token.1),
        end: tokens.last().map_or(0, |token| token.2),
        text: transcription.text.clone(),
        no_speech_prob: 0.0,
        words: piece_words(&tokens, |id| tokenizer.piece(id), |ids| tokenizer.decode(ids)),
    })
}

/// Turns `(id, frame, duration_frames)` into `(id, start_cs, end_cs)` for an
/// encoder whose frames last `frame_seconds` (Zipformer: 0.04 s, so 4 cs).
fn frame_spans(tokens: impl Iterator<Item = (u32, usize, usize)>, frame_seconds: f32) -> Vec<(u32, i64, i64)> {
    let centiseconds = |frame: usize| (frame as f64 * f64::from(frame_seconds) * 100.0).round() as i64;
    tokens
        .map(|(id, frame, duration)| (id, centiseconds(frame), centiseconds(frame + duration.max(1))))
        .collect()
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

    #[test]
    fn zipformer_frames_are_four_centiseconds() {
        let spans = frame_spans([(7, 0, 3), (8, 25, 10), (9, 90_000, 0)].into_iter(), 0.04);
        assert_eq!(spans, [(7, 0, 12), (8, 100, 140), (9, 360_000, 360_004)]);
        assert_eq!(frame_spans([(1, 25, 2)].into_iter(), 0.08), [(1, 200, 216)]);
    }

    #[test]
    fn zipformer_words_take_their_times_from_25_hz_frames() {
        let pieces = ["▁של", "ום", "▁לכולם", "."];
        let tokens = frame_spans([(0, 8, 7), (1, 15, 4), (2, 19, 10), (3, 60, 1)].into_iter(), 0.04);
        let decode = |ids: &[u32]| {
            ids.iter()
                .map(|&id| pieces[id as usize].replace('▁', " "))
                .collect::<String>()
        };
        let words = piece_words(&tokens, |id| pieces.get(id as usize).copied(), decode);
        let spans = words.iter().map(|w| (w.text.as_str(), w.start, w.end)).collect::<Vec<_>>();
        assert_eq!(spans, [(" שלום", 32, 76), (" לכולם.", 76, 244)]);
    }

    enum Value<'a> {
        Text(&'a str),
        Count(u32),
        Seconds(f32),
        Texts(&'a [&'a str]),
    }

    /// A GGUF v3 file holding only metadata, which is all detection reads.
    fn gguf(pairs: &[(&str, Value)]) -> tempfile::NamedTempFile {
        fn text(bytes: &mut Vec<u8>, value: &str) {
            bytes.extend((value.len() as u64).to_le_bytes());
            bytes.extend(value.as_bytes());
        }
        let mut bytes = b"GGUF".to_vec();
        bytes.extend(3u32.to_le_bytes());
        bytes.extend(0u64.to_le_bytes());
        bytes.extend((pairs.len() as u64).to_le_bytes());
        for (key, value) in pairs {
            text(&mut bytes, key);
            match value {
                Value::Count(count) => {
                    bytes.extend(4u32.to_le_bytes());
                    bytes.extend(count.to_le_bytes());
                }
                Value::Seconds(seconds) => {
                    bytes.extend(6u32.to_le_bytes());
                    bytes.extend(seconds.to_le_bytes());
                }
                Value::Text(value) => {
                    bytes.extend(8u32.to_le_bytes());
                    text(&mut bytes, value);
                }
                Value::Texts(values) => {
                    bytes.extend(9u32.to_le_bytes());
                    bytes.extend(8u32.to_le_bytes());
                    bytes.extend((values.len() as u64).to_le_bytes());
                    values.iter().for_each(|value| text(&mut bytes, value));
                }
            }
        }
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), bytes).unwrap();
        file
    }

    fn zipformer_gguf(head: &str) -> tempfile::NamedTempFile {
        gguf(&[
            ("general.architecture", Value::Text("zipformer2")),
            ("general.languages", Value::Texts(&["he"])),
            ("stt.variant", Value::Text("zipformer2-66m-streaming-he")),
            ("stt.zipformer.head_kind", Value::Text(head)),
            ("stt.zipformer.encoder.output_dim", Value::Count(512)),
            ("stt.zipformer.encoder.tail_pad_frames", Value::Count(30)),
            ("stt.zipformer.decoder.vocab", Value::Count(1493)),
            ("stt.zipformer.decoder.dim", Value::Count(512)),
            ("stt.zipformer.decoder.context_size", Value::Count(2)),
            ("stt.zipformer.joiner.dim", Value::Count(512)),
            ("stt.zipformer.search.max_symbols_per_frame", Value::Count(1)),
            ("stt.zipformer.search.frame_seconds", Value::Seconds(0.04)),
        ])
    }

    #[test]
    fn a_zipformer_gguf_is_detected_by_its_architecture() {
        let file = zipformer_gguf("transducer");
        let path = file.path().to_str().unwrap();
        assert!(is_gguf(path));
        let (model, capabilities) = probe_gguf(path).unwrap();
        assert_eq!(model, GgufModel::Zipformer);
        assert_eq!(capabilities.engine, "zipformer");
        assert_eq!(capabilities.languages, ["he"]);
        assert!(capabilities.requires_vad && capabilities.timestamps);
        assert!(!capabilities.translation && !capabilities.text_prompts && !capabilities.language_detection);
    }

    #[test]
    fn other_gguf_files_are_rejected_by_name() {
        let foreign = gguf(&[("general.architecture", Value::Text("nemotron3_diar"))]);
        let error = probe_gguf(foreign.path().to_str().unwrap()).unwrap_err();
        assert!(
            format!("{error:#}").contains("unsupported GGUF architecture 'nemotron3_diar'"),
            "{error:#}"
        );

        let ctc = zipformer_gguf("ctc");
        let error = probe_gguf(ctc.path().to_str().unwrap()).unwrap_err();
        assert!(
            format!("{error:#}").contains("unsupported Zipformer head \"ctc\""),
            "{error:#}"
        );

        let parakeet = gguf(&[("general.architecture", Value::Text("parakeet"))]);
        let error = probe_gguf(parakeet.path().to_str().unwrap()).unwrap_err();
        assert!(format!("{error:#}").contains("failed to read GGUF metadata"), "{error:#}");
    }

    #[test]
    fn a_whisper_container_is_not_gguf() {
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), b"lmgg\x01\x00\x00\x00").unwrap();
        assert!(!is_gguf(file.path().to_str().unwrap()));
        assert!(!is_gguf("/nonexistent/model.bin"));
    }
}
