use crate::setup::SonaState;
use eyre::{bail, Context, ContextCompat, Result};
use std::path::PathBuf;
use tauri::{Manager, State};
use tokio::sync::Mutex;

pub(crate) fn resolve_sona_binary(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
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

pub(crate) fn resolve_sidecar_binary(app_handle: &tauri::AppHandle, name: &str) -> Option<PathBuf> {
    let resource_dir = app_handle.path().resource_dir().ok()?;
    let ext = if cfg!(windows) { ".exe" } else { "" };
    let path = resource_dir.join(format!("{}{}", name, ext));
    path.exists().then_some(path)
}

pub(crate) fn resolve_ffmpeg_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    resolve_sidecar_binary(app_handle, "ffmpeg")
}

async fn ensure_sona_spawned(state: &Mutex<SonaState>, app_handle: &tauri::AppHandle) -> Result<()> {
    let mut state_guard = state.lock().await;
    if state_guard.process.is_none() {
        let binary_path = resolve_sona_binary(app_handle)?;
        let ffmpeg_path = resolve_ffmpeg_path(app_handle);
        let process = crate::sona::SonaProcess::spawn(&binary_path, ffmpeg_path.as_deref())?;
        state_guard.process = Some(process);
    }
    Ok(())
}

async fn respawn_sona(state: &Mutex<SonaState>, app_handle: &tauri::AppHandle) -> Result<()> {
    let mut state_guard = state.lock().await;
    if let Some(mut old) = state_guard.process.take() {
        old.kill();
    }
    let binary_path = resolve_sona_binary(app_handle)?;
    let ffmpeg_path = resolve_ffmpeg_path(app_handle);
    let process = crate::sona::SonaProcess::spawn(&binary_path, ffmpeg_path.as_deref())?;
    state_guard.process = Some(process);
    Ok(())
}

/// Spawns sona if needed and loads the model with GPU fallback to CPU.
/// Returns `true` if GPU fallback to CPU occurred.
async fn ensure_model_loaded(
    app_handle: &tauri::AppHandle,
    sona_state: &Mutex<SonaState>,
    model_path: &str,
    gpu_device: Option<i32>,
) -> Result<bool> {
    ensure_sona_spawned(sona_state, app_handle).await?;

    let load_result = {
        let mut state_guard = sona_state.lock().await;
        let sona = state_guard.process.as_mut().context("sona process missing")?;
        sona.load_model(model_path, gpu_device, false).await
    };

    match load_result {
        Ok(()) => {
            let mut state_guard = sona_state.lock().await;
            state_guard.loaded_model_path = Some(model_path.to_string());
            state_guard.loaded_gpu_device = gpu_device;
            Ok(false)
        }
        Err(e) => {
            tracing::warn!("GPU load failed, trying CPU: {:#}", e);
            respawn_sona(sona_state, app_handle).await?;

            let mut state_guard = sona_state.lock().await;
            let sona = state_guard.process.as_mut().context("sona process missing after respawn")?;
            sona.load_model(model_path, gpu_device, true).await?;
            state_guard.loaded_model_path = Some(model_path.to_string());
            state_guard.loaded_gpu_device = gpu_device;
            Ok(true)
        }
    }
}

#[tauri::command]
pub async fn load_model(app_handle: tauri::AppHandle, model_path: String, gpu_device: Option<i32>) -> Result<String> {
    let sona_state: State<'_, Mutex<SonaState>> = app_handle.state();

    {
        let state_guard = sona_state.lock().await;
        if let Some(ref loaded_path) = state_guard.loaded_model_path {
            if *loaded_path == model_path && state_guard.loaded_gpu_device == gpu_device {
                tracing::debug!("model already loaded, skipping");
                return Ok(model_path);
            }
        }
    }

    let gpu_fallback = ensure_model_loaded(&app_handle, &sona_state, &model_path, gpu_device).await?;

    if gpu_fallback {
        Ok("gpu_fallback".to_string())
    } else {
        Ok(model_path)
    }
}

#[tauri::command]
pub async fn preload_model(app_handle: tauri::AppHandle, model_path: String, gpu_device: Option<i32>) -> Result<()> {
    let sona_state: State<'_, Mutex<SonaState>> = app_handle.state();

    {
        let state_guard = sona_state.lock().await;
        if let Some(ref loaded_path) = state_guard.loaded_model_path {
            if *loaded_path == model_path && state_guard.loaded_gpu_device == gpu_device {
                tracing::debug!("preload_model: model already loaded, skipping");
                return Ok(());
            }
        }
    }

    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        tracing::debug!("preload_model: starting background preload for {}", model_path);
        let sona_state: State<'_, Mutex<SonaState>> = app_handle_clone.state();
        if let Err(e) = ensure_model_loaded(&app_handle_clone, &sona_state, &model_path, gpu_device).await {
            tracing::warn!("preload_model: failed: {:#}", e);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_gpu_devices(app_handle: tauri::AppHandle) -> Result<Vec<crate::sona::GpuDevice>> {
    let binary_path = resolve_sona_binary(&app_handle)?;
    let devices = crate::sona::list_gpu_devices(&binary_path)?;
    Ok(devices)
}

#[tauri::command]
pub async fn unload_model(app_handle: tauri::AppHandle) -> Result<()> {
    let sona_state: State<'_, Mutex<SonaState>> = app_handle.state();
    let mut state_guard = sona_state.lock().await;
    if let Some(mut process) = state_guard.process.take() {
        process.kill();
        tracing::debug!("sona process killed (provider switched)");
    }
    state_guard.loaded_model_path = None;
    state_guard.loaded_gpu_device = None;
    Ok(())
}
