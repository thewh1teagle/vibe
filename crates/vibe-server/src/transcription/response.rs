use std::convert::Infallible;

use axum::body::{Body, Bytes};
use axum::http::{HeaderMap, HeaderValue};
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use tokio::sync::mpsc;
use tokio_stream::wrappers::UnboundedReceiverStream;
use whisper_rs::TranscribeResult;

use crate::diarization::{SpeakerSegment, match_speaker};
use crate::formats::{seconds, srt, verbose_json_with_speakers, vtt};

pub fn complete(result: &TranscribeResult, response_format: &str, speaker_segments: &[SpeakerSegment]) -> Response {
    match response_format {
        "text" => ([(axum::http::header::CONTENT_TYPE, "text/plain")], result.text()).into_response(),
        "srt" => ([(axum::http::header::CONTENT_TYPE, "text/plain")], srt(&result.segments)).into_response(),
        "vtt" => ([(axum::http::header::CONTENT_TYPE, "text/plain")], vtt(&result.segments)).into_response(),
        "verbose_json" => axum::Json(verbose_json_with_speakers(result, speaker_segments)).into_response(),
        _ => axum::Json(JsonText { text: result.text() }).into_response(),
    }
}

pub type StreamSender = mpsc::UnboundedSender<Result<Bytes, Infallible>>;
pub type StreamReceiver = mpsc::UnboundedReceiver<Result<Bytes, Infallible>>;

pub fn stream(rx: StreamReceiver) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert("content-type", HeaderValue::from_static("application/x-ndjson"));
    headers.insert("cache-control", HeaderValue::from_static("no-cache"));
    headers.insert("connection", HeaderValue::from_static("keep-alive"));
    (headers, Body::from_stream(UnboundedReceiverStream::new(rx))).into_response()
}

pub fn channel() -> (StreamSender, StreamReceiver) {
    mpsc::unbounded_channel()
}

pub fn send(sender: &StreamSender, event: StreamEvent) {
    let _ = sender.send(Ok(Bytes::from(line(event))));
}

pub fn line(event: StreamEvent) -> String {
    format!("{}\n", serde_json::to_string(&event).unwrap())
}

#[derive(Serialize)]
struct JsonText {
    text: String,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    Progress {
        progress: i32,
    },
    Segment {
        start: f64,
        end: f64,
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        speaker: Option<i32>,
    },
    Result {
        text: String,
    },
    Error {
        message: String,
    },
}

impl StreamEvent {
    pub fn segment(segment: whisper_rs::Segment, speaker_segments: &[SpeakerSegment]) -> Self {
        let start = seconds(segment.start_cs);
        let end = seconds(segment.end_cs);
        Self::Segment {
            start,
            end,
            text: segment.text,
            speaker: match_speaker(start, end, speaker_segments),
        }
    }
}
