use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::server::{
    error, AppState, ModelInfo, ModelListResponse, ModelLoadRequest, ModelMetadataRequest, ModelMetadataResponse,
    ModelStatusResponse,
};

#[utoipa::path(
    post,
    path = "/v1/models/metadata",
    request_body = ModelMetadataRequest,
    responses(
        (status = 200, description = "Model metadata", body = ModelMetadataResponse),
        (status = 400, description = "Unsupported or invalid model", body = crate::server::ErrorResponse)
    )
)]
pub(in crate::server) async fn model_metadata(Json(request): Json<ModelMetadataRequest>) -> Response {
    if request.path.trim().is_empty() {
        return error(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "request body must contain a model path",
        );
    }
    let path = request.path.clone();
    match tokio::task::spawn_blocking(move || {
        // Probing a whisper model with the GGUF readers only makes ggml log a
        // magic mismatch, so files that are not GGUF go straight to whisper.
        if !is_gguf(&path) {
            return whisper_rs::validate_model_file(&path)
                .map(|()| crate::engine::whisper_capabilities())
                .map_err(|err| {
                    tracing::error!(model = path, "model metadata check failed: {err}");
                    err.to_string()
                });
        }

        if let Ok(info) = parakeet_rs::Model::metadata(&path) {
            if info.architecture == "parakeet" && info.head_kind == "tdt" && info.variant.contains("v3") {
                return Ok(crate::engine::EngineCapabilities {
                    engine: "parakeet".to_string(),
                    requires_vad: true,
                    languages: info.languages,
                    language_detection: info.language_detection,
                    streaming: false,
                    translation: false,
                    timestamps: true,
                    text_prompts: false,
                });
            }
        }

        match nemotron_rs::Model::metadata(&path) {
            Ok(info) if info.architecture == "parakeet" && info.head_kind == "rnnt" => Ok(crate::engine::EngineCapabilities {
                engine: "nemotron".to_string(),
                requires_vad: true,
                languages: info.languages,
                language_detection: info.language_detection,
                streaming: false,
                translation: false,
                timestamps: true,
                text_prompts: false,
            }),
            Ok(info) => Err(format!(
                "unsupported GGUF architecture '{}' with head '{}'",
                info.architecture, info.head_kind
            )),
            Err(err) => {
                tracing::error!(model = path, "failed to read GGUF metadata: {err}");
                Err(format!("failed to read GGUF metadata: {err}"))
            }
        }
    })
    .await
    {
        Ok(Ok(capabilities)) => (
            StatusCode::OK,
            Json(ModelMetadataResponse {
                format: if capabilities.engine == "whisper" { "whisper" } else { "gguf" },
                capabilities,
            }),
        )
            .into_response(),
        Ok(Err(message)) => error(StatusCode::BAD_REQUEST, "unsupported_model", &message),
        Err(err) => error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
            &format!("metadata task failed: {err}"),
        ),
    }
}

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

    let mut model = state.unload_timeout.acquire(state.inner.clone()).await;
    let gpu_device = request.gpu_device.unwrap_or(-1);
    match model.load_model(&request.path, gpu_device, request.no_gpu) {
        Ok(()) => (
            StatusCode::OK,
            Json(ModelStatusResponse {
                status: "loaded",
                model: model.model_name.clone(),
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

/// Whether the file starts with the GGUF magic. Whisper models use the older
/// GGML container and are handled by whisper.cpp instead.
fn is_gguf(path: &str) -> bool {
    use std::io::Read;

    let mut magic = [0u8; 4];
    std::fs::File::open(path).is_ok_and(|mut file| file.read_exact(&mut magic).is_ok()) && &magic == b"GGUF"
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}
