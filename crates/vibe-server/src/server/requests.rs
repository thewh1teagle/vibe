use axum::http::StatusCode;
use serde::Deserialize;

use crate::errors::{ApiError, ErrorCode};

#[derive(Deserialize, utoipa::ToSchema)]
pub struct LoadModelRequest {
    pub path: String,
    pub gpu_device: Option<i32>,
    #[serde(default)]
    pub no_gpu: bool,
}

impl LoadModelRequest {
    pub fn validate(&self) -> Result<(), ApiError> {
        if self.path.is_empty() {
            Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidRequest,
                "request body must contain {\"path\":\"...\"}",
            ))
        } else {
            Ok(())
        }
    }
}
