use crate::cmd::{self, DiarizeOptions};
use crate::setup::ModelContext;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Result;
use axum::routing::post;
use axum::Json;
use axum::{routing::get, Router};
use eyre::eyre;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Manager;
use tokio::sync::Mutex;
use utoipa::{OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;
use vibe_core::config::TranscribeOptions;
use vibe_core::transcript::{Segment, Transcript};

#[derive(OpenApi)]
#[openapi(
    paths(list_models, load, transcribe),
    components(schemas(TranscribeOptions, LoadPayload, Transcript, Segment))
)]
struct ApiDoc;

pub async fn run(app_handle: tauri::AppHandle, host: String, port: u16) -> eyre::Result<()> {
    let app = Router::new()
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .route("/transcribe", post(transcribe))
        .route("/load", post(load))
        .route("/list", get(list_models))
        .with_state(app_handle);

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", host, port)).await?;
    tracing::info!("Serve on http://{}:{}", host, port);
    axum::serve(listener, app.into_make_service())
        .await
        .map_err(|e| eyre!("{:?}", e))?;
    Ok(())
}

#[derive(Deserialize, Serialize, ToSchema)]
struct LoadPayload {
    pub model_path: String,
    pub gpu_device: Option<i32>,
}

/// Load model from path
#[utoipa::path(
	post,
	path = "/load",
	responses(
		(status = 200, description = "Load model", body = LoadPayload)
	),
)]
async fn load(State(app_handle): State<tauri::AppHandle>, Json(payload): Json<LoadPayload>) -> Result<String, String> {
    cmd::load_model(app_handle, payload.model_path, payload.gpu_device)
        .await
        .map_err(|e| e.to_string())
}

/// List all Todo items
///
/// List all Todo items from in-memory storage.
#[utoipa::path(
	get,
	path = "/list",
	responses(
		(status = 200, description = "List all models")
	)
)]
async fn list_models(State(app_handle): State<tauri::AppHandle>) -> Result<Json<Value>, (StatusCode, String)> {
    let models_folder = cmd::get_models_folder(app_handle).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut model_files = Vec::new();

    if models_folder.exists() && models_folder.is_dir() {
        tracing::debug!("checking {:?}", models_folder);
        for entry in std::fs::read_dir(&models_folder).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
            let entry = entry.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let path = entry.path();

            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("bin") {
                model_files.push(path.to_string_lossy().to_string());
            }
        }
    }

    tracing::debug!("files: {:?}", model_files);
    Ok(Json(Value::Array(model_files.into_iter().map(Value::String).collect())))
}

/// Transcribe file
#[utoipa::path(
	post,
	path = "/transcribe",
	responses(
		(status = 200, description = "List all models", body = Transcript)
	)
)]
async fn transcribe(
    State(app_handle): State<tauri::AppHandle>,
    Json(payload): Json<TranscribeOptions>,
) -> Result<Json<Transcript>, (StatusCode, String)> {
    let model_context_state: tauri::State<'_, Mutex<Option<ModelContext>>> = app_handle.state();
    let transcript = cmd::transcribe(app_handle.clone(), payload, model_context_state, DiarizeOptions::default())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(transcript))
}
