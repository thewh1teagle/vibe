use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, utoipa::ToSchema)]
pub struct Transcript {
    pub processing_time_sec: u64,
    pub segments: Vec<Segment>,
}
#[derive(Debug, Serialize, Deserialize, Clone, utoipa::ToSchema)]
pub struct Segment {
    pub start: i64,
    pub stop: i64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
}
