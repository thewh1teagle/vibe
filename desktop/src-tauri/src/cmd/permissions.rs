#[tauri::command]
pub async fn check_system_audio_permission() -> bool {
    macos_permissions::check_system_audio_permission()
}

#[tauri::command]
pub async fn request_system_audio_permission() -> bool {
    tokio::task::spawn_blocking(macos_permissions::request_system_audio_permission)
        .await
        .unwrap_or(false)
}

#[tauri::command]
pub async fn open_system_audio_settings() {
    macos_permissions::open_system_audio_settings();
}
