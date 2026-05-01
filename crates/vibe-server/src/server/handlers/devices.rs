use axum::Json;
use whisper_rs::{GpuDevice, list_gpu_devices};

pub async fn devices() -> Json<Vec<GpuDevice>> {
    Json(list_gpu_devices())
}
