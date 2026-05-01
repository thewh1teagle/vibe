use axum::Json;
use serde::Serialize;

pub async fn health() -> Json<StatusBody> {
    Json(StatusBody { status: "ok" })
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct StatusBody {
    pub status: &'static str,
}
