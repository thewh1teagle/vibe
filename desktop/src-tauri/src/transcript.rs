use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Transcript {
    pub processing_time_sec: u64,
    pub segments: Vec<Segment>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Segment {
    pub start: i64,
    pub stop: i64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<i32>,
}

impl Segment {
    pub fn from_secs(start: f64, end: f64, text: String) -> Self {
        Self {
            start: (start * 100.0).round() as i64,
            stop: (end * 100.0).round() as i64,
            text,
            speaker: None,
        }
    }
}
