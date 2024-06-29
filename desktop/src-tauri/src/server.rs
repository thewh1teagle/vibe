use crate::cmd;
use crate::config::{DEAFULT_SERVER_HOST, DEAFULT_SERVER_PORT};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Result;
use axum::routing::post;
use axum::Json;
use axum::{routing::get, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use vibe_core::config::TranscribeOptions;

pub async fn run(app_handle: tauri::AppHandle) {
    let app = Router::new()
        .route("/", get(|| async { "Vibe Server Running" }))
        .route("/transcribe", post(transcribe))
        .route("/load", post(load))
        .route("/list", get(list_models))
        .with_state(app_handle);

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", DEAFULT_SERVER_HOST, DEAFULT_SERVER_PORT))
        .await
        .unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn transcribe(State(_app_handle): State<tauri::AppHandle>, Json(options): Json<TranscribeOptions>) -> String {
    log::debug!("options: {:?}", options);
    "wip".into()
}

#[derive(Deserialize, Serialize)]
struct LoadPayload {
    pub model_path: String,
    pub gpu_device: Option<i32>,
}
async fn load(State(app_handle): State<tauri::AppHandle>, Json(payload): Json<LoadPayload>) -> Result<String, String> {
    cmd::load_model(app_handle, payload.model_path, payload.gpu_device)
        .await
        .map_err(|e| e.to_string())
}

async fn list_models(State(app_handle): State<tauri::AppHandle>) -> Result<Json<Value>, (StatusCode, String)> {
    let models_folder = cmd::get_models_folder(app_handle).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut model_files = Vec::new();

    if models_folder.exists() && models_folder.is_dir() {
        for entry in std::fs::read_dir(models_folder).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
            let entry = entry.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let path = entry.path();

            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("bin") {
                if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
                    model_files.push(file_name.to_string());
                }
            }
        }
    }

    Ok(Json(model_files.into()))
}
