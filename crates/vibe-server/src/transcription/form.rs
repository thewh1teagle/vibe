use std::io::Write;

use axum::extract::Multipart;
use axum::http::StatusCode;
use tempfile::NamedTempFile;

use crate::audio::read_audio_mono_f32;
use crate::errors::{ApiError, ErrorCode};

#[derive(Debug, Default)]
pub struct RequestForm {
    pub audio: Option<Vec<u8>>,
    pub language: String,
    pub prompt: String,
    pub detect_language: bool,
    pub enhance_audio: bool,
    pub response_format: String,
    pub stream: bool,
    pub translate: bool,
    pub word_timestamps: bool,
    pub n_threads: i32,
    pub max_segment_len: i32,
    pub max_text_ctx: i32,
    pub best_of: i32,
    pub beam_size: i32,
    pub temperature: f32,
    pub sampling_strategy: String,
    pub stable_timestamps: bool,
    pub vad_model: String,
    pub diarize_model: String,
}

impl RequestForm {
    pub async fn from_multipart(mut multipart: Multipart) -> Result<Self, ApiError> {
        let mut form = Self {
            response_format: "json".to_string(),
            ..Default::default()
        };
        while let Some(field) = multipart.next_field().await.map_err(invalid_form)? {
            let name = field.name().unwrap_or("").to_string();
            if name == "file" {
                form.audio = Some(field.bytes().await.map_err(invalid_form)?.to_vec());
            } else {
                let value = field.text().await.map_err(invalid_form)?;
                form.set_value(&name, value);
            }
        }
        Ok(form)
    }

    pub fn read_samples(&self) -> Result<Vec<f32>, ApiError> {
        let audio = self
            .audio
            .as_ref()
            .ok_or_else(|| ApiError::new(StatusCode::BAD_REQUEST, ErrorCode::InvalidRequest, "missing file field"))?;
        let mut temp = NamedTempFile::new().map_err(internal_error)?;
        temp.write_all(audio).map_err(internal_error)?;
        self.validate()?;
        read_audio_mono_f32(temp.path(), self.enhance_audio).map_err(|err| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidAudio,
                format!("invalid audio file: {err:#}"),
            )
        })
    }

    fn set_value(&mut self, name: &str, value: String) {
        match name {
            "language" => self.language = value,
            "prompt" => self.prompt = value,
            "detect_language" => self.detect_language = parse_bool(&value),
            "enhance_audio" => self.enhance_audio = parse_bool(&value),
            "response_format" => self.response_format = value,
            "stream" => self.stream = parse_bool(&value),
            "translate" => self.translate = parse_bool(&value),
            "word_timestamps" => self.word_timestamps = parse_bool(&value),
            "n_threads" => self.n_threads = parse_i32(&value),
            "max_segment_len" => self.max_segment_len = parse_i32(&value),
            "max_text_ctx" => self.max_text_ctx = parse_i32(&value),
            "best_of" => self.best_of = parse_i32(&value),
            "beam_size" => self.beam_size = parse_i32(&value),
            "temperature" => self.temperature = value.parse().unwrap_or(0.0),
            "sampling_strategy" => self.sampling_strategy = value,
            "stable_timestamps" => self.stable_timestamps = parse_bool(&value),
            "vad_model" => self.vad_model = value,
            "diarize_model" => self.diarize_model = value,
            _ => {}
        }
    }

    fn validate(&self) -> Result<(), ApiError> {
        if self.stable_timestamps && self.vad_model.is_empty() {
            Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidRequest,
                "'vad_model' is required when 'stable_timestamps' is true",
            ))
        } else {
            Ok(())
        }
    }
}

fn invalid_form(err: impl std::fmt::Display) -> ApiError {
    ApiError::new(StatusCode::BAD_REQUEST, ErrorCode::InvalidRequest, err.to_string())
}

fn internal_error(err: impl std::fmt::Display) -> ApiError {
    ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, ErrorCode::InternalError, err.to_string())
}

fn parse_bool(value: &str) -> bool {
    value.parse::<bool>().unwrap_or(false)
}

fn parse_i32(value: &str) -> i32 {
    value.parse().unwrap_or(0)
}
