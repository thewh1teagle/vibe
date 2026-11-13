//! The loaded model and what it can do: transcribe one chunk of audio, and
//! walk a long recording VAD chunk by VAD chunk.
//!
//! Each chunk runs through the encoder whole (full context) with a padded
//! tail, then through a greedy transducer search from a fresh context.

use std::path::Path;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Instant;

use crate::decoder::{Decoder, Joiner};
use crate::encoder::Encoder;
use crate::fbank::{Fbank, NUM_BINS, SAMPLE_RATE};
use crate::load::Weights;
use crate::search::SearchConfig;
use crate::segment::{assign_times, split_sentences};
use crate::{Error, Result, Tokenizer};

#[derive(Debug, Clone, PartialEq)]
pub struct ModelInfo {
    pub architecture: String,
    pub variant: String,
    pub head_kind: String,
    pub languages: Vec<String>,
    pub language_detection: bool,
    pub encoder_dimension: usize,
    pub vocabulary_size: usize,
    pub decoder_dimension: usize,
    pub decoder_context_size: usize,
    pub joiner_dimension: usize,
    pub max_symbols_per_frame: usize,
    pub tail_pad_frames: usize,
    /// Seconds per encoder frame, the unit of [`crate::Token::frame`].
    pub frame_seconds: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Transcription {
    pub text: String,
    pub tokens: Vec<crate::Token>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct LongFormTranscription {
    pub segments: Vec<Transcription>,
}

impl LongFormTranscription {
    pub fn text(&self) -> String {
        self.segments
            .iter()
            .map(|segment| segment.text.trim())
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

pub struct Model {
    info: ModelInfo,
    tokenizer: Tokenizer,
    fbank: Fbank,
    encoder: Mutex<Encoder>,
    decoder: Decoder,
    joiner: Joiner,
    search: SearchConfig,
    pad_value: f32,
    frame_samples: usize,
}

fn invalid(key: &'static str, message: String) -> Error {
    Error::InvalidMetadata { key, message }
}

fn read_info(weights: &Weights) -> Result<ModelInfo> {
    let size = |key| weights.meta_u32(key).map(|value| value as usize);
    Ok(ModelInfo {
        architecture: weights.meta_str("general.architecture")?,
        variant: weights.meta_str("stt.variant").unwrap_or_default(),
        head_kind: weights.meta_str("stt.zipformer.head_kind")?,
        languages: weights.meta_strs("general.languages")?,
        language_detection: false,
        encoder_dimension: size("stt.zipformer.encoder.output_dim")?,
        vocabulary_size: size("stt.zipformer.decoder.vocab")?,
        decoder_dimension: size("stt.zipformer.decoder.dim")?,
        decoder_context_size: size("stt.zipformer.decoder.context_size")?,
        joiner_dimension: size("stt.zipformer.joiner.dim")?,
        max_symbols_per_frame: size("stt.zipformer.search.max_symbols_per_frame")?,
        tail_pad_frames: size("stt.zipformer.encoder.tail_pad_frames")?,
        frame_seconds: weights.meta_f32("stt.zipformer.search.frame_seconds")?,
    })
}

fn check_architecture(info: &ModelInfo) -> Result<()> {
    if info.architecture != "zipformer2" {
        return Err(Error::UnsupportedArchitecture(info.architecture.clone()));
    }
    if info.head_kind != "transducer" {
        return Err(Error::UnsupportedHead(info.head_kind.clone()));
    }
    Ok(())
}

fn check_frontend(weights: &Weights) -> Result<()> {
    let kind = weights.meta_str("stt.frontend.type")?;
    if kind != "kaldi_fbank" {
        return Err(invalid("stt.frontend.type", format!("unsupported frontend {kind:?}")));
    }
    for (key, expected) in [("stt.frontend.num_mels", NUM_BINS), ("stt.frontend.sample_rate", SAMPLE_RATE)] {
        let value = weights.meta_u32(key)? as usize;
        if value != expected {
            return Err(invalid(key, format!("{value} is not supported, expected {expected}")));
        }
    }
    Ok(())
}

impl Model {
    /// Reads the model's description without loading tensor data; fails on
    /// anything but a Zipformer2 transducer.
    pub fn metadata(path: impl AsRef<Path>) -> Result<ModelInfo> {
        let info = read_info(&Weights::open_metadata(path.as_ref())?)?;
        check_architecture(&info)?;
        Ok(info)
    }

    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        Self::load_with(path, true)
    }

    /// `use_gpu = false` keeps the encoder on the CPU backend.
    pub fn load_with(path: impl AsRef<Path>, use_gpu: bool) -> Result<Self> {
        let started = Instant::now();
        eprintln!("[zipformer][load] begin path={}", path.as_ref().display());
        let weights = Arc::new(Weights::open(path.as_ref())?);
        let info = read_info(&weights)?;
        check_architecture(&info)?;
        check_frontend(&weights)?;
        let tokenizer = Tokenizer::load(&weights)?;
        let decoder = Decoder::load(&weights)?;
        let joiner = Joiner::load(&weights)?;

        let frame_samples = (info.frame_seconds * SAMPLE_RATE as f32).round();
        if frame_samples.is_nan() || frame_samples < 1.0 {
            return Err(invalid(
                "stt.zipformer.search.frame_seconds",
                format!("{} is not a frame length", info.frame_seconds),
            ));
        }
        if info.max_symbols_per_frame == 0 {
            return Err(invalid(
                "stt.zipformer.search.max_symbols_per_frame",
                "must be at least 1".into(),
            ));
        }
        if decoder.vocab() != tokenizer.len() || joiner.vocab() != tokenizer.len() {
            return Err(invalid(
                "tokenizer.ggml.tokens",
                format!(
                    "{} pieces, but the decoder embeds {} and the joiner scores {}",
                    tokenizer.len(),
                    decoder.vocab(),
                    joiner.vocab()
                ),
            ));
        }
        if decoder.dim() != joiner.decoder_dim() || info.encoder_dimension != joiner.encoder_dim() {
            return Err(Error::Load(format!(
                "joiner expects encoder {} and decoder {}, the model provides {} and {}",
                joiner.encoder_dim(),
                joiner.decoder_dim(),
                info.encoder_dimension,
                decoder.dim()
            )));
        }

        let search = SearchConfig {
            blank_id: tokenizer.blank_id(),
            unknown_id: tokenizer.unknown_id(),
            context_size: decoder.context_size(),
            max_symbols_per_frame: info.max_symbols_per_frame,
        };
        let pad_value = weights.meta_f32("stt.frontend.pad_value")?;
        let encoder = Encoder::new(weights, use_gpu)?;
        eprintln!(
            "[zipformer][load] done elapsed_ms={} variant={} vocabulary={} backend={}",
            started.elapsed().as_millis(),
            info.variant,
            info.vocabulary_size,
            if encoder.on_gpu() { "gpu" } else { "cpu" }
        );
        Ok(Self {
            info,
            tokenizer,
            fbank: Fbank::new(),
            encoder: Mutex::new(encoder),
            decoder,
            joiner,
            search,
            pad_value,
            frame_samples: frame_samples as usize,
        })
    }

    pub fn info(&self) -> &ModelInfo {
        &self.info
    }

    pub fn tokenizer(&self) -> &Tokenizer {
        &self.tokenizer
    }

    /// Accepts `auto` and the model's own languages, by primary subtag
    /// (`he-IL`) and under the legacy code `iw`.
    fn validate_language(&self, language: &str) -> Result<()> {
        let primary = language.split(['-', '_']).next().unwrap_or_default().to_ascii_lowercase();
        let primary = if primary == "iw" { "he" } else { primary.as_str() };
        if primary == "auto" || self.info.languages.iter().any(|candidate| candidate == primary) {
            Ok(())
        } else {
            Err(Error::UnsupportedLanguage(language.to_owned()))
        }
    }

    /// Transcribes one chunk of 16 kHz mono audio (at most about 30 s; memory
    /// grows with the square of its length). Token frames count from the start
    /// of `samples` and stay inside it.
    pub fn transcribe_chunk(&self, samples: &[f32], language: &str) -> Result<Transcription> {
        self.validate_language(language)?;
        let started = Instant::now();
        let mut features = self.fbank.compute(samples);
        if features.frames == 0 {
            return Ok(Transcription {
                text: String::new(),
                tokens: Vec::new(),
            });
        }
        features.pad_tail(self.info.tail_pad_frames, self.pad_value);
        let fbank_ms = started.elapsed().as_millis();

        let encoder_started = Instant::now();
        let encoded = self
            .encoder
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .forward(&features)?;
        if encoded.dim != self.joiner.encoder_dim() || encoded.data.len() != encoded.frames * encoded.dim {
            return Err(Error::Ggml("encoder output has an unexpected shape"));
        }
        let encoder_ms = encoder_started.elapsed().as_millis();

        let search_started = Instant::now();
        let mut tokens = crate::search::decode(&self.decoder, &self.joiner, self.search, &encoded.data, |_, _| {});
        assign_times(&mut tokens, samples.len(), self.frame_samples);
        let ids = tokens.iter().map(|token| token.id).collect::<Vec<_>>();
        eprintln!(
            "[zipformer][chunk] samples={} fbank_ms={fbank_ms} encoder_ms={encoder_ms} frames={} search_ms={} tokens={} total_ms={}",
            samples.len(),
            encoded.frames,
            search_started.elapsed().as_millis(),
            tokens.len(),
            started.elapsed().as_millis()
        );
        Ok(Transcription {
            text: self.tokenizer.decode_clean(&ids),
            tokens,
        })
    }

    pub fn transcribe(&self, vad: &mut vad_rs::Vad, samples: &[f32], language: &str) -> Result<LongFormTranscription> {
        self.transcribe_with(vad, samples, language, || false, |_| {}, |_| {})
    }

    /// Transcribes each VAD chunk on its own and reports it sentence by
    /// sentence. Token frames count from the start of `samples`.
    pub fn transcribe_with(
        &self,
        vad: &mut vad_rs::Vad,
        samples: &[f32],
        language: &str,
        mut should_abort: impl FnMut() -> bool,
        mut on_segment: impl FnMut(&Transcription),
        mut on_progress: impl FnMut(i32),
    ) -> Result<LongFormTranscription> {
        self.validate_language(language)?;
        let all_started = Instant::now();
        let ranges = vad.segments(samples).map_err(|error| Error::Vad(error.to_string()))?;
        eprintln!(
            "[zipformer][vad] elapsed_ms={} audio_s={:.3} chunks={}",
            all_started.elapsed().as_millis(),
            samples.len() as f64 / SAMPLE_RATE as f64,
            ranges.len()
        );
        let total_samples = ranges
            .iter()
            .map(|range| range.end_sample.saturating_sub(range.start_sample))
            .sum::<usize>()
            .max(1);
        let mut processed_samples = 0;
        on_progress(0);
        let mut result = LongFormTranscription {
            segments: Vec::with_capacity(ranges.len()),
        };
        let mut last_frame = None;
        for range in ranges {
            if should_abort() {
                return Err(Error::Aborted);
            }
            let mut transcription = self.transcribe_chunk(&samples[range.start_sample..range.end_sample], language)?;
            let frame_offset = range.start_sample / self.frame_samples;
            for token in &mut transcription.tokens {
                token.frame += frame_offset;
            }
            // Hard-split chunks overlap; what the previous one already covered is dropped.
            if let Some(frame) = last_frame {
                transcription.tokens.retain(|token| token.frame > frame);
            }
            last_frame = transcription.tokens.last().map(|token| token.frame).or(last_frame);
            for segment in split_sentences(transcription.tokens, &self.tokenizer) {
                on_segment(&segment);
                result.segments.push(segment);
            }
            processed_samples += range.end_sample.saturating_sub(range.start_sample);
            on_progress(((processed_samples * 100) / total_samples).min(100) as i32);
        }
        eprintln!(
            "[zipformer][long-form] total_ms={} segments={} rtf={:.4}",
            all_started.elapsed().as_millis(),
            result.segments.len(),
            all_started.elapsed().as_secs_f64() / (samples.len() as f64 / SAMPLE_RATE as f64).max(0.001)
        );
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fbank::testdata::{clip, gguf, Npy, CLIPS};
    use crate::segment::audio_frames;

    #[test]
    fn long_form_text_joins_trimmed_segments() {
        let segment = |text: &str| Transcription {
            text: text.into(),
            tokens: Vec::new(),
        };
        let result = LongFormTranscription {
            segments: vec![segment("שלום לכולם. "), segment(""), segment(" היום.")],
        };
        assert_eq!(result.text(), "שלום לכולם. היום.");
    }

    #[test]
    #[ignore = "needs ZIPFORMER_REF_DIR and ZIPFORMER_GGUF"]
    fn transcribes_reference_clips_end_to_end() {
        let model = Model::load_with(gguf(), std::env::var_os("ZIPFORMER_CPU").is_none()).unwrap();
        assert_eq!(model.info().languages, ["he"]);
        assert_eq!(&Model::metadata(gguf()).unwrap(), model.info());
        assert!(matches!(
            model.transcribe_chunk(&[0.0; 16_000], "en"),
            Err(Error::UnsupportedLanguage(language)) if language == "en"
        ));
        assert!(model.transcribe_chunk(&[], "iw").unwrap().tokens.is_empty());
        for name in CLIPS {
            let dir = clip(name);
            let samples = Npy::read(&dir.join("samples.npy")).f32();
            let result = model.transcribe_chunk(&samples, "he").unwrap();
            let expected_text = std::fs::read_to_string(dir.join("text.txt")).unwrap();
            let expected_ids = Npy::read(&dir.join("tokens.npy")).i32();
            let last = audio_frames(samples.len(), model.frame_samples) - 1;
            let expected_frames = Npy::read(&dir.join("token_frames.npy"))
                .i32()
                .iter()
                .map(|&frame| (frame as usize).min(last))
                .collect::<Vec<_>>();
            let ids = result.tokens.iter().map(|token| token.id as i32).collect::<Vec<_>>();
            let frames = result.tokens.iter().map(|token| token.frame).collect::<Vec<_>>();
            let same_text = result.text == expected_text.trim();
            eprintln!(
                "{name}: text_match={same_text} ids_match={} frames_match={} tokens={}",
                ids == expected_ids,
                frames == expected_frames,
                ids.len()
            );
            assert!(same_text, "{name}: {}", result.text);
            assert_eq!(ids, expected_ids, "{name}");
            assert_eq!(frames, expected_frames, "{name}");
            assert!(result
                .tokens
                .iter()
                .all(|token| token.duration_frames >= 1 && token.frame + token.duration_frames <= last + 1));
        }
    }
}
