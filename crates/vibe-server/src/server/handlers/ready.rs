use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Serialize;

use crate::state::SharedState;

pub async fn ready(State(state): State<SharedState>) -> (StatusCode, Json<ReadyBody>) {
    let status = state.status().await;
    if status.loaded {
        (
            StatusCode::OK,
            Json(ReadyBody {
                status: "ready",
                model: Some(status.model_name),
                message: None,
            }),
        )
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ReadyBody {
                status: "not_ready",
                model: None,
                message: Some("no model loaded"),
            }),
        )
    }
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct ReadyBody {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<&'static str>,
}
