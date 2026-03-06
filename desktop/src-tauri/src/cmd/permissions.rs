#[tauri::command]
pub async fn request_system_audio_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        tokio::task::spawn_blocking(cpal::request_system_audio_permission)
            .await
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
pub async fn open_system_audio_settings() {
    #[cfg(target_os = "macos")]
    {
        cpal::open_system_audio_settings();
    }
}
