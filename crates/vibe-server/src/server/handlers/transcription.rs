use axum::extract::{Multipart, State};
use axum::response::Response;

use crate::errors::ApiError;
use crate::state::SharedState;
use crate::transcription;

pub async fn transcribe(State(state): State<SharedState>, multipart: Multipart) -> Result<Response, ApiError> {
    transcription::transcribe(state, multipart).await
}
