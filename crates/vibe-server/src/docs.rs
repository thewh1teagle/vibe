#![allow(dead_code)]

use utoipa::OpenApi;

use crate::server::requests::LoadModelRequest;

#[derive(OpenApi)]
#[openapi(
    paths(
        health,
        ready,
        models,
        load_model,
        unload_model,
        transcriptions,
        devices,
    ),
    components(schemas(
        LoadModelRequest,
        ModelLoadResponse,
        ModelListResponse,
        ReadyResponse,
        StatusResponse,
        TextResponse,
        TranscriptionForm,
        VerboseJsonResponse,
        VerboseSegmentResponse,
        GpuDeviceResponse,
    )),
    tags(
        (name = "vibe-server", description = "Local Vibe transcription sidecar")
    )
)]
pub struct ApiDoc;

#[utoipa::path(
    get,
    path = "/health",
    responses((status = 200, description = "Process is alive", body = StatusResponse))
)]
fn health() {}

#[utoipa::path(
    get,
    path = "/ready",
    responses(
        (status = 200, description = "Model loaded", body = ReadyResponse),
        (status = 503, description = "No model loaded", body = ReadyResponse)
    )
)]
fn ready() {}

#[utoipa::path(
    get,
    path = "/v1/models",
    responses((status = 200, description = "Loaded models", body = ModelListResponse))
)]
fn models() {}

#[utoipa::path(
    post,
    path = "/v1/models/load",
    request_body = LoadModelRequest,
    responses((status = 200, description = "Model loaded", body = ModelLoadResponse))
)]
fn load_model() {}

#[utoipa::path(
    delete,
    path = "/v1/models",
    responses((status = 200, description = "Model unloaded", body = StatusResponse))
)]
fn unload_model() {}

#[utoipa::path(
    post,
    path = "/v1/audio/transcriptions",
    request_body(content = TranscriptionForm, content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "Transcription result. Body depends on response_format: json, verbose_json, text, srt, vtt, or application/x-ndjson when stream=true."),
        (status = 400, description = "Invalid request or audio"),
        (status = 429, description = "Server is busy"),
        (status = 503, description = "No model loaded")
    )
)]
fn transcriptions() {}

#[utoipa::path(
    get,
    path = "/v1/devices",
    responses((status = 200, description = "GPU devices", body = Vec<GpuDeviceResponse>))
)]
fn devices() {}

#[derive(utoipa::ToSchema)]
struct TranscriptionForm {
    #[schema(value_type = String, format = Binary)]
    file: String,
    language: Option<String>,
    prompt: Option<String>,
    detect_language: Option<bool>,
    enhance_audio: Option<bool>,
    response_format: Option<ResponseFormat>,
    stream: Option<bool>,
    model: Option<String>,
    beam_size: Option<i32>,
    best_of: Option<i32>,
    diarize_model: Option<String>,
    max_segment_len: Option<i32>,
    max_text_ctx: Option<i32>,
    n_threads: Option<i32>,
    sampling_strategy: Option<SamplingStrategy>,
    stable_timestamps: Option<bool>,
    temperature: Option<f32>,
    translate: Option<bool>,
    vad_model: Option<String>,
    word_timestamps: Option<bool>,
}

#[derive(utoipa::ToSchema)]
#[schema(rename_all = "snake_case")]
enum ResponseFormat {
    Json,
    VerboseJson,
    Text,
    Srt,
    Vtt,
}

#[derive(utoipa::ToSchema)]
#[schema(rename_all = "snake_case")]
enum SamplingStrategy {
    Greedy,
    BeamSearch,
}

#[derive(utoipa::ToSchema)]
struct StatusResponse {
    status: String,
}

#[derive(utoipa::ToSchema)]
struct ReadyResponse {
    status: String,
    model: Option<String>,
    message: Option<String>,
}

#[derive(utoipa::ToSchema)]
struct ModelLoadResponse {
    status: String,
    model: String,
}

#[derive(utoipa::ToSchema)]
struct ModelListResponse {
    object: String,
    data: Vec<ModelItemResponse>,
}

#[derive(utoipa::ToSchema)]
struct ModelItemResponse {
    id: String,
    object: String,
    created: i64,
    owned_by: String,
}

#[derive(utoipa::ToSchema)]
struct TextResponse {
    text: String,
}

#[derive(utoipa::ToSchema)]
struct VerboseJsonResponse {
    text: String,
    segments: Vec<VerboseSegmentResponse>,
}

#[derive(utoipa::ToSchema)]
struct VerboseSegmentResponse {
    start: f64,
    end: f64,
    text: String,
    speaker: Option<i32>,
}

#[derive(utoipa::ToSchema)]
struct GpuDeviceResponse {
    index: i32,
    name: String,
    description: String,
    #[schema(rename = "type")]
    device_type: String,
}
