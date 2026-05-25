#[tauri::command]
pub async fn request_system_audio_permission() -> bool {
    true
}

#[tauri::command]
pub async fn open_system_audio_settings() {
    // macOS-specific, not available in upstream cpal
}
