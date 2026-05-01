mod form;
mod options;
mod response;
mod runner;

use axum::extract::Multipart;
use axum::http::StatusCode;
use axum::response::Response;

use crate::errors::{ApiError, ErrorCode};
use crate::state::SharedState;

pub async fn transcribe(state: SharedState, multipart: Multipart) -> Result<Response, ApiError> {
    let form = form::RequestForm::from_multipart(multipart).await?;
    let samples = form.read_samples()?;
    if samples.is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidAudio,
            "audio file contains no samples",
        ));
    }
    if form.stream {
        runner::stream(state, samples, form).await
    } else {
        runner::once(state, samples, form).await
    }
}
