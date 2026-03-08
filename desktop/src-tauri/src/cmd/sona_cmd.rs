use crate::setup::SonaState;
use eyre::{bail, Context, ContextCompat, Result};
use std::path::PathBuf;
use tauri::{Manager, State};
use tokio::sync::Mutex;

pub fn resolve_sona_binary(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    // Try to find sona binary in the app's resource directory (sidecar)
    let resource_dir = app_handle.path().resource_dir().context("get resource dir")?;

    #[cfg(target_os = "windows")]
    let binary_name = "sona.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "sona";

    // Check resource dir (Tauri externalBin places them here)
    let sidecar_path = resource_dir.join(binary_name);
    if sidecar_path.exists() {
        return Ok(sidecar_path);
    }

    // Check in same directory as the executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let path = exe_dir.join(binary_name);
            if path.exists() {
                return Ok(path);
            }
        }
    }

    // Common Linux install paths (deb/rpm/AUR packages)
    #[cfg(target_os = "linux")]
    {
        let linux_paths = [
            PathBuf::from("/usr/lib/vibe").join(binary_name),
            PathBuf::from("/usr/lib/vibe/binaries").join(binary_name),
            PathBuf::from("/opt/vibe").join(binary_name),
            PathBuf::from("/opt/vibe/binaries").join(binary_name),
        ];
        for path in &linux_paths {
            if path.exists() {
                return Ok(path.clone());
            }
        }
    }

    // Fallback: check PATH
    if let Ok(path) = which::which(binary_name) {
        return Ok(path);
    }

    bail!("sona binary not found")
}

pub fn resolve_ffmpeg_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    let resource_dir = app_handle.path().resource_dir().ok()?;

    #[cfg(target_os = "windows")]
    let binary_name = "ffmpeg.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "ffmpeg";

    let sidecar_path = resource_dir.join(binary_name);
    if sidecar_path.exists() {
        return Some(sidecar_path);
    }

    None
}

pub fn resolve_diarize_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    let resource_dir = app_handle.path().resource_dir().ok()?;

    #[cfg(target_os = "windows")]
    let binary_name = "sona-diarize.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "sona-diarize";

    let sidecar_path = resource_dir.join(binary_name);
    if sidecar_path.exists() {
        return Some(sidecar_path);
    }

    None
}

#[tauri::command]
pub async fn load_model(app_handle: tauri::AppHandle, model_path: String, gpu_device: Option<i32>) -> Result<String> {
    let sona_state: State<'_, Mutex<SonaState>> = app_handle.state();
    let mut state_guard = sona_state.lock().await;

    // Check if model already loaded with same gpu_device
    if let Some(ref loaded_path) = state_guard.loaded_model_path {
        if *loaded_path == model_path && state_guard.loaded_gpu_device == gpu_device {
            tracing::debug!("model already loaded, skipping");
            return Ok(model_path);
        }
    }

    let spawn_sona = || -> Result<crate::sona::SonaProcess> {
        let binary_path = resolve_sona_binary(&app_handle)?;
        let ffmpeg_path = resolve_ffmpeg_path(&app_handle);
        let diarize_path = resolve_diarize_path(&app_handle);
        crate::sona::SonaProcess::spawn(&binary_path, ffmpeg_path.as_deref(), diarize_path.as_deref())
    };

    // Spawn sona if not running
    if state_guard.process.is_none() {
        match spawn_sona() {
            Ok(process) => state_guard.process = Some(process),
            Err(e) => {
                let error_msg = format!("{:#}", e);
                crate::analytics::track_event_handle_with_props(
                    &app_handle,
                    crate::analytics::events::SONA_SPAWN_FAILED,
                    Some(serde_json::json!({"error_message": error_msg})),
                );
                return Err(e);
            }
        }
    }

    // Load model via HTTP
    let load_result = {
        let sona = state_guard.process.as_mut().unwrap();
        sona.load_model(&model_path, gpu_device, false).await
    };

    let gpu_fallback = match load_result {
        Ok(()) => false,
        Err(e) => {
            tracing::warn!("model load failed with GPU enabled, falling back to CPU: {:#}", e);

            // Kill existing process and respawn, then reload with no_gpu
            if let Some(mut old) = state_guard.process.take() {
                old.kill();
            }
            let process = spawn_sona().context("failed to respawn sona")?;
            state_guard.process = Some(process);

            let sona = state_guard.process.as_mut().unwrap();
            sona.load_model(&model_path, gpu_device, true).await?;
            true
        }
    };
    state_guard.loaded_model_path = Some(model_path.clone());
    state_guard.loaded_gpu_device = gpu_device;

    if gpu_fallback {
        Ok("gpu_fallback".to_string())
    } else {
        Ok(model_path)
    }
}

#[tauri::command]
pub async fn get_gpu_devices(app_handle: tauri::AppHandle) -> Result<Vec<crate::sona::GpuDevice>> {
    let binary_path = resolve_sona_binary(&app_handle)?;
    let devices = crate::sona::list_gpu_devices(&binary_path)?;
    Ok(devices)
}

#[tauri::command]
pub async fn get_api_base_url(sona_state: State<'_, Mutex<SonaState>>) -> Result<Option<String>> {
    let state = sona_state.lock().await;
    Ok(state.process.as_ref().map(|process| process.base_url()))
}

#[tauri::command]
pub async fn start_api_server(app_handle: tauri::AppHandle, sona_state: State<'_, Mutex<SonaState>>) -> Result<String> {
    let mut state_guard = sona_state.lock().await;
    if state_guard.process.is_none() {
        let binary_path = resolve_sona_binary(&app_handle)?;
        let ffmpeg_path = resolve_ffmpeg_path(&app_handle);
        let diarize_path = resolve_diarize_path(&app_handle);
        let process = crate::sona::SonaProcess::spawn(&binary_path, ffmpeg_path.as_deref(), diarize_path.as_deref())?;
        state_guard.process = Some(process);
    }
    let process = state_guard.process.as_ref().context("API server process missing")?;
    Ok(process.base_url())
}

#[tauri::command]
pub async fn stop_api_server(sona_state: State<'_, Mutex<SonaState>>) -> Result<bool> {
    let mut state_guard = sona_state.lock().await;
    if let Some(mut process) = state_guard.process.take() {
        process.kill();
        state_guard.loaded_model_path = None;
        state_guard.loaded_gpu_device = None;
        return Ok(true);
    }
    Ok(false)
}
