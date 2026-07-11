use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::server::{error, AppState, ModelInfo, ModelListResponse, ModelLoadRequest, ModelStatusResponse};

#[utoipa::path(
    post,
    path = "/v1/models/load",
    request_body = ModelLoadRequest,
    responses(
        (status = 200, description = "Model loaded", body = ModelStatusResponse),
        (status = 400, description = "Invalid request", body = crate::server::ErrorResponse),
        (status = 500, description = "Load failed", body = crate::server::ErrorResponse)
    )
)]
pub(in crate::server) async fn load_model(State(state): State<AppState>, Json(request): Json<ModelLoadRequest>) -> Response {
    if request.path.trim().is_empty() {
        return error(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "request body must contain {\"path\": \"...\"}",
        );
    }

    let mut guard = state.inner.lock().await;
    let gpu_device = request.gpu_device.unwrap_or(-1);
    match guard.load_model(&request.path, gpu_device, request.no_gpu.unwrap_or(false)) {
        Ok(()) => (
            StatusCode::OK,
            Json(ModelStatusResponse {
                status: "loaded",
                model: guard.model_name.clone(),
            }),
        )
            .into_response(),
        Err(err) => error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
            &format!("failed to load model: {err}"),
        ),
    }
}

#[utoipa::path(
    delete,
    path = "/v1/models",
    responses((status = 200, description = "Model unloaded", body = serde_json::Value))
)]
pub(in crate::server) async fn unload_model(State(state): State<AppState>) -> impl IntoResponse {
    state.inner.lock().await.unload_model();
    (StatusCode::OK, Json(serde_json::json!({ "status": "unloaded" })))
}

#[utoipa::path(
    get,
    path = "/v1/models",
    responses((status = 200, description = "OpenAI-style model list", body = ModelListResponse))
)]
pub(in crate::server) async fn list_models(State(state): State<AppState>) -> impl IntoResponse {
    let state = state.inner.lock().await;
    let data = if let Some(engine) = state.ctx.as_ref() {
        vec![ModelInfo {
            id: state.model_name.clone(),
            object: "model",
            created: now_unix(),
            owned_by: "local",
            capabilities: engine.capabilities(),
        }]
    } else {
        Vec::new()
    };
    (StatusCode::OK, Json(ModelListResponse { object: "list", data }))
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}
