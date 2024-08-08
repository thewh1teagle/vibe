use eyre::Result;
use num::integer::div_floor;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub fn format_timestamp(seconds: i64, always_include_hours: bool, decimal_marker: &str) -> String {
    assert!(seconds >= 0, "non-negative timestamp expected");
    let mut milliseconds = seconds * 10;

    let hours = div_floor(milliseconds, 3_600_000);
    milliseconds -= hours * 3_600_000;

    let minutes = div_floor(milliseconds, 60_000);
    milliseconds -= minutes * 60_000;

    let seconds = div_floor(milliseconds, 1_000);
    milliseconds -= seconds * 1_000;

    let hours_marker = if always_include_hours || hours != 0 {
        format!("{:02}:", hours)
    } else {
        String::new()
    };

    format!("{hours_marker}{minutes:02}:{seconds:02}{decimal_marker}{milliseconds:03}")
}

#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
pub struct Transcript {
    pub processing_time_sec: u64,
    pub segments: Vec<Segment>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
pub struct Segment {
    pub start: i64,
    pub stop: i64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
}

impl Segment {
    pub fn as_text(&self) -> String {
        self.text.to_owned()
    }

    pub fn as_vtt(&self) -> String {
        format!(
            "{} --> {}\n{}\n",
            format_timestamp(self.start, false, "."),
            format_timestamp(self.stop, false, "."),
            self.text.trim().replace("-->", "->")
        )
    }

    pub fn as_srt(&self, index: i32) -> String {
        format!(
            "\n{index}\n{} --> {}\n{}\n",
            format_timestamp(self.start, true, ","),
            format_timestamp(self.stop, true, ","),
            self.text.trim().replace("-->", "->")
        )
    }
}

impl Transcript {
    pub fn as_text(&self) -> String {
        self.segments
            .iter()
            .fold(String::new(), |transcript, fragment| transcript + fragment.text.as_str())
    }

    pub fn as_json(&self) -> Result<String> {
        Ok(serde_json::to_string_pretty(self)?)
    }

    pub fn as_vtt(&self) -> String {
        self.segments
            .iter()
            .fold(String::new(), |transcript, fragment| transcript + fragment.as_vtt().as_str())
    }

    pub fn as_srt(&self) -> String {
        self.segments
            .iter()
            .fold((1, String::new()), |(i, transcript), fragment| {
                (i + 1, transcript + fragment.as_srt(i).as_str())
            })
            .1
    }
}
