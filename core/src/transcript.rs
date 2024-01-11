use num::integer::div_floor;
use serde::{Deserialize, Serialize};
use std::time::Duration;

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
        format!("{hours}:")
    } else {
        String::new()
    };

    format!("{hours_marker}{minutes:02}:{seconds:02}{decimal_marker}{milliseconds:03}")
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Transcript {
    pub processing_time: Duration,
    pub utterances: Vec<Utternace>,
    pub word_utterances: Option<Vec<Utternace>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Utternace {
    pub start: i64,
    pub stop: i64,
    pub text: String,
}

impl Transcript {
    pub fn as_text(&self) -> String {
        self.utterances.iter().fold(String::new(), |transcript, fragment| {
            transcript + format!("{}\n", fragment.text.trim()).as_str()
        })
    }

    pub fn as_vtt(&self) -> String {
        self.word_utterances
            .as_ref()
            .unwrap_or(&self.utterances)
            .iter()
            .fold(String::new(), |transcript, fragment| {
                transcript
                    + format!(
                        "{} --> {}\n{}\n",
                        format_timestamp(fragment.start, false, "."),
                        format_timestamp(fragment.stop, false, "."),
                        fragment.text.trim().replace("-->", "->")
                    )
                    .as_str()
            })
    }

    pub fn as_srt(&self) -> String {
        self.word_utterances
            .as_ref()
            .unwrap_or(&self.utterances)
            .iter()
            .fold((1, String::new()), |(i, transcript), fragment| {
                (
                    i + 1,
                    transcript
                        + format!(
                            "\n{i}\n{} --> {}\n{}\n",
                            format_timestamp(fragment.start, true, ","),
                            format_timestamp(fragment.stop, true, ","),
                            fragment.text.trim().replace("-->", "->")
                        )
                        .as_str(),
                )
            })
            .1
    }
}
