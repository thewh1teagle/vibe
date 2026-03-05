#[tauri::command]
pub async fn request_system_audio_permission() -> bool {
    tokio::task::spawn_blocking(cpal::request_system_audio_permission)
        .await
        .unwrap_or(false)
}

#[tauri::command]
pub async fn open_system_audio_settings() {
    cpal::open_system_audio_settings();
}
