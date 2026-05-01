use serde::Serialize;
use whisper_rs::{Segment, TranscribeResult};

use crate::diarization::{SpeakerSegment, match_speaker};

pub fn seconds(cs: i64) -> f64 {
    cs as f64 / 100.0
}

pub fn srt(segments: &[Segment]) -> String {
    let mut out = String::new();
    for (index, segment) in segments.iter().enumerate() {
        if index > 0 {
            out.push('\n');
        }
        out.push_str(&format!(
            "{}\n{} --> {}\n{}\n",
            index + 1,
            srt_time(segment.start_cs),
            srt_time(segment.end_cs),
            segment.text.trim()
        ));
    }
    out
}

pub fn vtt(segments: &[Segment]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for (index, segment) in segments.iter().enumerate() {
        if index > 0 {
            out.push('\n');
        }
        out.push_str(&format!(
            "{} --> {}\n{}\n",
            vtt_time(segment.start_cs),
            vtt_time(segment.end_cs),
            segment.text.trim()
        ));
    }
    out
}

pub fn verbose_json_with_speakers(result: &TranscribeResult, speaker_segments: &[SpeakerSegment]) -> VerboseJson {
    VerboseJson {
        text: result.text(),
        segments: result
            .segments
            .iter()
            .map(|segment| VerboseSegment {
                start: seconds(segment.start_cs),
                end: seconds(segment.end_cs),
                text: segment.text.clone(),
                speaker: match_speaker(seconds(segment.start_cs), seconds(segment.end_cs), speaker_segments),
            })
            .collect(),
    }
}

#[derive(Serialize)]
pub struct VerboseJson {
    pub text: String,
    pub segments: Vec<VerboseSegment>,
}

#[derive(Serialize)]
pub struct VerboseSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<i32>,
}

fn srt_time(cs: i64) -> String {
    let (h, m, s, ms) = split_time(cs);
    format!("{h:02}:{m:02}:{s:02},{ms:03}")
}

fn vtt_time(cs: i64) -> String {
    let (h, m, s, ms) = split_time(cs);
    format!("{h:02}:{m:02}:{s:02}.{ms:03}")
}

fn split_time(cs: i64) -> (i64, i64, i64, i64) {
    let total_ms = cs * 10;
    let total_s = total_ms / 1000;
    let ms = total_ms % 1000;
    let s = total_s % 60;
    let total_m = total_s / 60;
    let m = total_m % 60;
    let h = total_m / 60;
    (h, m, s, ms)
}
