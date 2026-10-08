use anyhow::{ensure, Context as _};
use funasr_runtime::manifest::{ModelKind, Package};
use funasr_runtime::worker::Worker;
use vad_rs::SpeechSegment;
use whisper_rs::{Segment, StreamCallbacks, TranscribeOptions, TranscribeResult};

use super::EngineCapabilities;

pub struct FunAsr {
    kind: ModelKind,
    worker: Worker,
    vad: Option<(String, vad_rs::Vad)>,
}

impl FunAsr {
    pub fn load(package: &Package, gpu_device: i32) -> anyhow::Result<Self> {
        Ok(Self {
            kind: package.kind,
            worker: Worker::load(package, gpu_device)?,
            vad: None,
        })
    }

    pub fn is_alive(&mut self) -> bool {
        self.worker.is_alive()
    }

    pub fn capabilities(&self) -> EngineCapabilities {
        capabilities(self.kind)
    }

    pub fn transcribe(
        &mut self,
        samples: &[f32],
        options: TranscribeOptions,
        callbacks: StreamCallbacks<'_>,
    ) -> anyhow::Result<TranscribeResult> {
        validate_options(&options)?;
        let path = options
            .vad_model_path
            .as_deref()
            .context("vad_model_path is required for native ASR")?;
        if self.vad.as_ref().is_none_or(|(cached, _)| cached != path) {
            self.vad = Some((path.to_owned(), vad_rs::Vad::new(path, vad_options())?));
        }
        let ranges = self.vad.as_mut().expect("VAD initialized").1.segments(samples)?;
        transcribe_ranges(samples, &ranges, self.kind, callbacks, |chunk, abort| {
            self.worker.transcribe(chunk, abort)
        })
    }
}

fn vad_options() -> vad_rs::Options {
    vad_rs::Options {
        max_chunk_ms: 30_000,
        overlap_ms: 0,
        ..vad_rs::Options::default()
    }
}

pub fn capabilities(kind: ModelKind) -> EngineCapabilities {
    EngineCapabilities {
        engine: match kind {
            ModelKind::FunAsrNano => "funasr-nano",
            ModelKind::SenseVoice => "sensevoice",
        }
        .to_owned(),
        requires_vad: true,
        languages: Vec::new(),
        language_detection: true,
        streaming: false,
        translation: false,
        timestamps: true,
        text_prompts: false,
    }
}

pub fn validate_device(gpu_device: i32) -> anyhow::Result<()> {
    // A GPU index selects the encoder and LLM device in the worker; when the
    // worker has no GPU backend it falls back to the CPU with a stderr note.
    ensure!(
        (-1..=15).contains(&gpu_device),
        "gpu_device must be -1 (CPU) or a GPU index 0..=15"
    );
    Ok(())
}

/// The device the worker should run on, with -1 meaning the CPU. Mirrors the
/// rule whisper follows: "Transcribe on the CPU" wins, then a pinned GPU
/// device, then the default GPU — the worker falls back to the CPU when it
/// was built without a GPU backend.
pub fn device_index(no_gpu: bool, gpu_device: i32) -> i32 {
    if no_gpu {
        -1
    } else {
        gpu_device.max(0)
    }
}

pub fn validate_options(options: &TranscribeOptions) -> anyhow::Result<()> {
    ensure!(
        matches!(options.language.as_deref(), None | Some("" | "auto")),
        "native ASR only supports automatic language detection; language must be 'auto' or omitted"
    );
    ensure!(!options.translate, "native ASR does not support translate");
    ensure!(options.prompt.is_none(), "native ASR does not support prompt");
    ensure!(!options.word_timestamps, "native ASR does not support word_timestamps");
    ensure!(
        options.max_segment_len <= 0,
        "native ASR does not support max_segment_len > 0"
    );
    ensure!(options.temperature == 0.0, "native ASR requires temperature = 0");
    ensure!(options.max_text_ctx <= 0, "native ASR does not support max_text_ctx > 0");
    ensure!(options.sampling_greedy, "native ASR does not support beam search");
    ensure!(
        matches!(options.threads, 0 | 8),
        "native ASR uses 8 CPU threads; n_threads must be 0 or 8"
    );
    for (name, value) in [("best_of", options.best_of), ("beam_size", options.beam_size)] {
        ensure!(
            matches!(value, 0 | 5),
            "native ASR does not support custom {name}; omit it or use the default (0 or 5)"
        );
    }
    Ok(())
}

fn transcribe_ranges(
    samples: &[f32],
    ranges: &[SpeechSegment],
    kind: ModelKind,
    callbacks: StreamCallbacks<'_>,
    mut infer: impl FnMut(&[f32], &mut dyn FnMut() -> bool) -> anyhow::Result<String>,
) -> anyhow::Result<TranscribeResult> {
    let StreamCallbacks {
        mut on_progress,
        mut on_segment,
        mut should_abort,
    } = callbacks;
    let mut segments = Vec::new();
    for range in ranges {
        let end = range.end_sample.min(samples.len());
        let start = range.start_sample.min(end);
        let chunk = &samples[start..end];
        if chunk.len() >= 400 && chunk.iter().any(|&sample| sample != 0.0) {
            let text = infer(chunk, &mut || should_abort.as_mut().is_some_and(|callback| callback()))?;
            let text = match kind {
                ModelKind::FunAsrNano => text.replace("/sil", ""),
                ModelKind::SenseVoice => text,
            };
            let text = text.trim();
            if !text.is_empty() {
                let segment = Segment {
                    start: (start as i64 * 100) / vad_rs::SAMPLE_RATE as i64,
                    end: (end as i64 * 100) / vad_rs::SAMPLE_RATE as i64,
                    text: text.to_owned(),
                    no_speech_prob: 0.0,
                };
                if let Some(callback) = on_segment.as_mut() {
                    callback(segment.clone());
                }
                segments.push(segment);
            }
        }
        if let Some(callback) = on_progress.as_mut() {
            callback(((end as u64 * 100) / samples.len().max(1) as u64) as i32);
        }
    }
    if let Some(callback) = on_progress.as_mut() {
        callback(100);
    }
    Ok(TranscribeResult { segments })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_original_offsets_and_reports_completed_audio() {
        let samples = vec![0.25; 80_000];
        let ranges = [
            SpeechSegment {
                start_sample: 16_000,
                end_sample: 32_000,
            },
            SpeechSegment {
                start_sample: 48_000,
                end_sample: 64_000,
            },
        ];
        let mut progress = Vec::new();
        let mut emitted = Vec::new();
        let result = transcribe_ranges(
            &samples,
            &ranges,
            ModelKind::FunAsrNano,
            StreamCallbacks {
                on_progress: Some(Box::new(|value| progress.push(value))),
                on_segment: Some(Box::new(|segment| emitted.push(segment))),
                ..Default::default()
            },
            |chunk, _| {
                assert_eq!(chunk.len(), 16_000);
                Ok(" /silhello /sil ".into())
            },
        )
        .unwrap();
        assert_eq!(result.segments.len(), 2);
        assert_eq!((result.segments[0].start, result.segments[0].end), (100, 200));
        assert_eq!((result.segments[1].start, result.segments[1].end), (300, 400));
        assert_eq!(emitted.len(), 2);
        assert!(emitted.iter().all(|segment| segment.text == "hello"));
        assert_eq!(progress, [40, 80, 100]);
    }

    #[test]
    fn silence_and_short_chunks_never_call_worker() {
        let mut progress = Vec::new();
        for (samples, ranges) in [
            (vec![], vec![]),
            (vec![0.0; 32_000], vec![]),
            (
                vec![0.0; 32_000],
                vec![SpeechSegment {
                    start_sample: 0,
                    end_sample: 32_000,
                }],
            ),
            (
                vec![0.25; 399],
                vec![SpeechSegment {
                    start_sample: 0,
                    end_sample: 399,
                }],
            ),
        ] {
            let result = transcribe_ranges(
                &samples,
                &ranges,
                ModelKind::SenseVoice,
                StreamCallbacks {
                    on_progress: Some(Box::new(|value| progress.push(value))),
                    on_segment: Some(Box::new(|_| panic!("silence emitted text"))),
                    ..Default::default()
                },
                |_, _| panic!("silence reached worker"),
            )
            .unwrap();
            assert!(result.segments.is_empty());
            assert_eq!(progress.last(), Some(&100));
        }
    }

    #[test]
    fn empty_native_text_does_not_emit_segments() {
        for text in ["", "  ", "/sil /sil"] {
            let result = transcribe_ranges(
                &[0.25; 400],
                &[SpeechSegment {
                    start_sample: 0,
                    end_sample: 400,
                }],
                ModelKind::FunAsrNano,
                StreamCallbacks {
                    on_segment: Some(Box::new(|_| panic!("empty segment"))),
                    ..Default::default()
                },
                |_, _| Ok(text.to_owned()),
            )
            .unwrap();
            assert!(result.segments.is_empty());
        }
    }

    #[test]
    fn cancellation_reaches_worker_and_stops_before_final_progress() {
        let mut progress = Vec::new();
        let result = transcribe_ranges(
            &[0.25; 400],
            &[SpeechSegment {
                start_sample: 0,
                end_sample: 400,
            }],
            ModelKind::SenseVoice,
            StreamCallbacks {
                on_progress: Some(Box::new(|value| progress.push(value))),
                should_abort: Some(Box::new(|| true)),
                ..Default::default()
            },
            |_, abort| {
                assert!(abort());
                anyhow::bail!("cancelled")
            },
        );
        assert!(result.is_err());
        assert!(progress.is_empty());
    }

    #[test]
    fn native_capabilities_and_vad_are_conservative() {
        for (kind, name) in [(ModelKind::FunAsrNano, "funasr-nano"), (ModelKind::SenseVoice, "sensevoice")] {
            let caps = capabilities(kind);
            assert_eq!(caps.engine, name);
            assert!(caps.requires_vad && caps.language_detection && caps.timestamps);
            assert!(caps.languages.is_empty());
            assert!(!caps.streaming && !caps.translation && !caps.text_prompts);
        }
        assert_eq!(vad_options().max_chunk_ms, 30_000);
        assert_eq!(vad_options().overlap_ms, 0);
        assert!(validate_device(-1).is_ok());
        assert!(validate_device(0).is_ok());
        assert!(validate_device(-2).is_err());
        assert!(validate_device(16).is_err());
        // "Transcribe on the CPU" wins over any pinned device, and an unpinned
        // device (-1) means the default GPU rather than the CPU.
        assert_eq!(device_index(true, 3), -1);
        assert_eq!(device_index(false, -1), 0);
        assert_eq!(device_index(false, 3), 3);
    }

    #[test]
    fn rejects_unsupported_options_even_with_detect_language() {
        let defaults = TranscribeOptions::default();
        assert!(validate_options(&defaults).is_ok());
        for options in [
            TranscribeOptions {
                language: Some("en".into()),
                detect_language: true,
                ..defaults.clone()
            },
            TranscribeOptions {
                translate: true,
                ..defaults.clone()
            },
            TranscribeOptions {
                prompt: Some("hello".into()),
                ..defaults.clone()
            },
            TranscribeOptions {
                word_timestamps: true,
                ..defaults.clone()
            },
            TranscribeOptions {
                max_segment_len: 1,
                ..defaults.clone()
            },
            TranscribeOptions {
                temperature: 0.1,
                ..defaults.clone()
            },
            TranscribeOptions {
                temperature: f32::NAN,
                ..defaults.clone()
            },
            TranscribeOptions {
                max_text_ctx: 1,
                ..defaults.clone()
            },
            TranscribeOptions {
                sampling_greedy: false,
                ..defaults.clone()
            },
            TranscribeOptions {
                threads: 4,
                ..defaults.clone()
            },
            TranscribeOptions {
                best_of: 1,
                ..defaults.clone()
            },
            TranscribeOptions {
                beam_size: 1,
                ..defaults.clone()
            },
        ] {
            assert!(validate_options(&options).is_err(), "{options:?}");
        }
        assert!(validate_options(&TranscribeOptions {
            language: Some("auto".into()),
            threads: 8,
            best_of: 5,
            beam_size: 5,
            ..defaults
        })
        .is_ok());
    }
}
