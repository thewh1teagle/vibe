use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Serialize;

use crate::errors::{ApiError, ErrorCode};
use crate::server::requests::LoadModelRequest;
use crate::state::SharedState;

pub async fn load_model(
    State(state): State<SharedState>,
    Json(request): Json<LoadModelRequest>,
) -> Result<Json<ModelLoadedBody>, ApiError> {
    request.validate()?;
    let model = state
        .load_model(&request.path, request.gpu_device, request.no_gpu)
        .await
        .map_err(|err| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::InternalError,
                format!("failed to load model: {err}"),
            )
        })?;
    Ok(Json(ModelLoadedBody { status: "loaded", model }))
}

pub async fn unload_model(State(state): State<SharedState>) -> Json<StatusBody> {
    state.unload_model().await;
    Json(StatusBody { status: "unloaded" })
}

pub async fn models(State(state): State<SharedState>) -> Json<ModelList> {
    let status = state.status().await;
    let data = if status.loaded {
        vec![ModelItem {
            id: status.model_name,
            object: "model",
            created: current_unix_time(),
            owned_by: "local",
        }]
    } else {
        Vec::new()
    };
    Json(ModelList { object: "list", data })
}

fn current_unix_time() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct ModelLoadedBody {
    pub status: &'static str,
    pub model: String,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct StatusBody {
    pub status: &'static str,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct ModelList {
    pub object: &'static str,
    pub data: Vec<ModelItem>,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct ModelItem {
    pub id: String,
    pub object: &'static str,
    pub created: i64,
    pub owned_by: &'static str,
}
