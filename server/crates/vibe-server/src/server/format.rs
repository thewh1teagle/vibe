use serde::Serialize;
use whisper_rs::{Segment, TranscribeResult, Word};

use crate::server::{diarization, speakers};

pub fn cs_to_seconds(cs: i64) -> f64 {
    cs as f64 / 100.0
}

fn cs_to_srt_time(cs: i64) -> String {
    let mut ms = cs * 10;
    let mut s = ms / 1000;
    ms %= 1000;
    let mut m = s / 60;
    s %= 60;
    let h = m / 60;
    m %= 60;
    format!("{h:02}:{m:02}:{s:02},{ms:03}")
}

pub(crate) fn cs_to_vtt_time(cs: i64) -> String {
    cs_to_srt_time(cs).replace(',', ".")
}

pub fn format_srt(segments: &[Segment]) -> String {
    let mut out = String::new();
    for (index, segment) in segments.iter().enumerate() {
        if index > 0 {
            out.push('\n');
        }
        out.push_str(&format!(
            "{}\n{} --> {}\n{}\n",
            index + 1,
            cs_to_srt_time(segment.start),
            cs_to_srt_time(segment.end),
            segment.text.trim()
        ));
    }
    out
}

pub fn format_vtt(segments: &[Segment]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for (index, segment) in segments.iter().enumerate() {
        if index > 0 {
            out.push('\n');
        }
        out.push_str(&format!(
            "{} --> {}\n{}\n",
            cs_to_vtt_time(segment.start),
            cs_to_vtt_time(segment.end),
            segment.text.trim()
        ));
    }
    out
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct VerboseJson {
    pub text: String,
    pub segments: Vec<VerboseSegment>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct VerboseSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<usize>,
    pub no_speech_prob: f32,
    /// The segment's words with their own times. Left out when the engine timed none.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub words: Vec<VerboseWord>,
}

/// One word of a segment. Times are seconds, like the segment's; the text keeps
/// its leading space, so joining a segment's words rebuilds its text.
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct VerboseWord {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

pub fn verbose_words(words: Vec<Word>) -> Vec<VerboseWord> {
    words
        .into_iter()
        .map(|word| VerboseWord {
            start: cs_to_seconds(word.start),
            end: cs_to_seconds(word.end),
            text: word.text,
        })
        .collect()
}

/// With diarization, a recognizer segment that spans several speakers comes out
/// as one entry per speaker run.
pub fn build_verbose_json(result: &TranscribeResult, diar_segments: &[diarization::Segment]) -> VerboseJson {
    VerboseJson {
        text: result.text(),
        segments: result
            .segments
            .iter()
            .flat_map(|segment| speakers::attribute(segment, diar_segments))
            .map(|turn| VerboseSegment {
                start: cs_to_seconds(turn.start),
                end: cs_to_seconds(turn.end),
                text: turn.text,
                speaker: turn.speaker,
                no_speech_prob: turn.no_speech_prob,
                words: verbose_words(turn.words),
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(words: Vec<Word>) -> Segment {
        Segment {
            start: 120,
            end: 250,
            text: " Hello world.".into(),
            no_speech_prob: 0.0,
            words,
        }
    }

    #[test]
    fn verbose_json_segments_carry_words_in_seconds() {
        let result = TranscribeResult {
            segments: vec![segment(vec![
                Word {
                    start: 120,
                    end: 170,
                    text: " Hello".into(),
                },
                Word {
                    start: 180,
                    end: 250,
                    text: " world.".into(),
                },
            ])],
        };
        let json = serde_json::to_value(build_verbose_json(&result, &[])).unwrap();
        assert_eq!(
            json["segments"][0]["words"],
            serde_json::json!([
                { "start": 1.2, "end": 1.7, "text": " Hello" },
                { "start": 1.8, "end": 2.5, "text": " world." },
            ])
        );
    }

    #[test]
    fn verbose_json_omits_words_when_there_are_none() {
        let result = TranscribeResult {
            segments: vec![segment(Vec::new())],
        };
        let json = serde_json::to_value(build_verbose_json(&result, &[])).unwrap();
        assert!(json["segments"][0].get("words").is_none());
        assert_eq!(json["segments"][0]["text"], " Hello world.");
    }
}
