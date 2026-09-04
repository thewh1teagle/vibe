use std::collections::HashMap;

use axum::extract::{Multipart, State};
use axum::http::StatusCode;
use axum::response::Response;

use crate::server::transcription::TranscriptionRequest;
use crate::server::{error, AppState, MAX_UPLOAD_SIZE};

#[utoipa::path(
    post,
    path = "/v1/audio/transcriptions",
    responses(
        (status = 200, description = "Transcription result"),
        (status = 400, description = "Invalid request/audio", body = crate::server::ErrorResponse),
        (status = 429, description = "Busy", body = crate::server::ErrorResponse),
        (status = 503, description = "No model loaded", body = crate::server::ErrorResponse)
    )
)]
pub(in crate::server) async fn transcriptions(State(state): State<AppState>, multipart: Multipart) -> Response {
    let model = match state.unload_timeout.try_acquire(state.inner.clone()) {
        Ok(model) => model,
        Err(_) => {
            return error(
                StatusCode::TOO_MANY_REQUESTS,
                "busy",
                "server is busy with another transcription",
            );
        }
    };
    match parse_multipart(multipart).await {
        Ok(request) => match crate::server::transcription::transcribe(state.config, model, request).await {
            Ok(response) => response,
            Err(response) => response,
        },
        Err(response) => response,
    }
}

async fn parse_multipart(mut multipart: Multipart) -> Result<TranscriptionRequest, Response> {
    let mut file = None;
    let mut form = HashMap::new();

    while let Some(field) = multipart.next_field().await.map_err(|err| {
        error(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            &format!("invalid multipart form: {err}"),
        )
    })? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" {
            let bytes = field.bytes().await.map_err(|err| {
                error(
                    StatusCode::BAD_REQUEST,
                    "invalid_request",
                    &format!("missing or invalid 'file' field: {err}"),
                )
            })?;
            if bytes.len() > MAX_UPLOAD_SIZE {
                return Err(error(
                    StatusCode::BAD_REQUEST,
                    "invalid_request",
                    "uploaded file is too large",
                ));
            }
            file = Some(bytes.to_vec());
        } else {
            let value = field.text().await.unwrap_or_default();
            form.insert(name, value);
        }
    }

    let file = file.ok_or_else(|| error(StatusCode::BAD_REQUEST, "invalid_request", "missing or invalid 'file' field"))?;

    Ok(TranscriptionRequest { file, form })
}
