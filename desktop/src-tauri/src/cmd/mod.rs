use crate::audio_utils;
use crate::config::STORE_FILENAME;
use crate::setup::SonaState;
use crate::sona::SonaEvent;
use crate::types::{Segment, Transcript};
use crate::utils::{get_current_dir, LogError};
use eyre::{bail, Context, ContextCompat, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{
    window::{ProgressBarState, ProgressBarStatus},
    Manager,
};
use tauri::{Emitter, Listener, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;
pub mod audio;
pub mod ytdlp;

/// Return true if there's internet connection
/// timeout in ms
#[tauri::command]
pub async fn is_online(timeout: Option<u64>) -> Result<bool> {
    let timeout = std::time::Duration::from_millis(timeout.unwrap_or(2000));
    let targets = ["1.1.1.1:80", "1.1.1.1:53", "8.8.8.8:53", "8.8.8.8:80"];

    let tasks = targets.iter().map(|addr| async move {
        tokio::time::timeout(timeout, tokio::net::TcpStream::connect(addr))
            .await
            .map(|res| res.is_ok())
            .unwrap_or(false)
    });

    Ok(futures::future::join_all(tasks).await.into_iter().any(|res| res))
}

fn set_progress_bar(app_handle: &tauri::AppHandle, progress: Option<f64>) -> Result<()> {
    let window = app_handle.get_webview_window("main").context("get window")?;
    if let Some(progress) = progress {
        tracing::debug!("set_progress_bar {}", progress);
        window.emit("transcribe_progress", progress)?;
        if progress > 1.0 {
            window.set_progress_bar(ProgressBarState {
                progress: Some(progress as u64),
                status: if cfg!(target_os = "windows") {
                    None
                } else {
                    Some(ProgressBarStatus::Indeterminate)
                },
            })?;
        }
    } else {
        window.set_progress_bar(ProgressBarState {
            progress: Some(0),
            status: Some(ProgressBarStatus::None),
        })?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_commit_hash() -> String {
    env!("COMMIT_HASH").to_string()
}

#[tauri::command]
pub fn get_x86_features() -> Option<Value> {
    #[cfg(all(any(target_arch = "x86", target_arch = "x86_64"), target_os = "windows"))]
    {
        let features: Value = serde_json::to_value(crate::x86_features::X86features::new()).unwrap_or_default();
        Some(features)
    }

    #[cfg(not(all(any(target_arch = "x86", target_arch = "x86_64"), target_os = "windows")))]
    {
        None
    }
}

#[tauri::command]
pub async fn download_model(app_handle: tauri::AppHandle, url: String, path: String) -> Result<String> {
    tracing::debug!("Download model invoked! with path {}", path);

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    let app_handle_c = app_handle.clone();

    let app_handle_d = app_handle_c.clone();
    app_handle.listen("abort_download", move |_| {
        set_progress_bar(&app_handle_d, None).log_error();
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let client = reqwest::Client::new();
    let res = client.get(&url).send().await?.error_for_status()?;
    let total_size = res.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(&path).context(format!("Failed to create file {}", path))?;
    let mut downloaded: u64 = 0;
    let callback_limit: u64 = 1024 * 1024 * 2;
    let mut callback_offset: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        if abort_atomic.load(Ordering::Relaxed) {
            break;
        }
        let chunk = item.context("Error while downloading file")?;
        use std::io::Write;
        file.write_all(&chunk)
            .context(format!("Error while writing to file {}", path))?;
        downloaded += chunk.len() as u64;
        if total_size > 0 && downloaded > callback_offset + callback_limit {
            let percentage = (downloaded as f64 / total_size as f64) * 100.0;
            tracing::trace!("percentage: {}", percentage);
            set_progress_bar(&app_handle_c, Some(percentage)).log_error();
            if let Some(window) = app_handle_c.get_webview_window("main") {
                window.emit("download_progress", (downloaded, total_size)).log_error();
            }
            callback_offset = downloaded;
        }
    }
    set_progress_bar(&app_handle, None)?;
    Ok(path)
}

#[tauri::command]
pub fn get_ffmpeg_path() -> String {
    audio_utils::find_ffmpeg_path()
        .map(|p| p.to_str().unwrap().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn download_file(app_handle: tauri::AppHandle, url: String, path: String) -> Result<()> {
    tracing::debug!("Download file invoked! with path {}", path);

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    let app_handle_c = app_handle.clone();

    let app_handle_d = app_handle_c.clone();
    app_handle.listen("abort_download", move |_| {
        set_progress_bar(&app_handle_d, None).log_error();
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let client = reqwest::Client::new();
    let res = client.get(&url).send().await?.error_for_status()?;
    let total_size = res.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(&path).context(format!("Failed to create file {}", path))?;
    let mut downloaded: u64 = 0;
    let callback_limit: u64 = 1024 * 1024 * 2;
    let mut callback_offset: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        if abort_atomic.load(Ordering::Relaxed) {
            break;
        }
        let chunk = item.context("Error while downloading file")?;
        use std::io::Write;
        file.write_all(&chunk)
            .context(format!("Error while writing to file {}", path))?;
        downloaded += chunk.len() as u64;
        if total_size > 0 && downloaded > callback_offset + callback_limit {
            let percentage = (downloaded as f64 / total_size as f64) * 100.0;
            tracing::trace!("percentage: {}", percentage);
            if let Some(window) = app_handle_c.get_webview_window("main") {
                window.emit("download_progress", (downloaded, total_size)).log_error();
            }
            callback_offset = downloaded;
        }
    }
    Ok(())
}

#[allow(dead_code)]
#[derive(Deserialize, Serialize, Clone)]
pub struct FfmpegOptions {
    pub normalize_loudness: bool,
    pub custom_command: Option<String>,
}

impl Default for FfmpegOptions {
    fn default() -> Self {
        Self {
            normalize_loudness: true,
            custom_command: None,
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct TranscribeOptions {
    pub path: String,
    pub lang: Option<String>,
    pub verbose: Option<bool>,
    pub n_threads: Option<i32>,
    pub init_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub translate: Option<bool>,
    pub max_text_ctx: Option<i32>,
    pub word_timestamps: Option<bool>,
    pub max_sentence_len: Option<i32>,
    pub sampling_strategy: Option<String>,
    pub best_of: Option<i32>,
    pub beam_size: Option<i32>,
    pub diarize_model: Option<String>,
}

#[tauri::command]
pub async fn glob_files(folder: String, patterns: Vec<String>, recursive: bool) -> Vec<String> {
    let mut files = Vec::new();

    let search_pattern = if recursive {
        format!("{}/**/*", folder)
    } else {
        format!("{}/*", folder)
    };

    match glob::glob(&search_pattern) {
        Ok(paths) => {
            for entry in paths.filter_map(Result::ok) {
                if entry.is_file() {
                    if let Some(file_name) = entry.file_name().and_then(|n| n.to_str()) {
                        if patterns.iter().any(|p| file_name.ends_with(p)) {
                            if let Ok(path_str) = entry.into_os_string().into_string() {
                                files.push(path_str);
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to read pattern {}: {}", search_pattern, e);
        }
    }

    files
}

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
pub async fn transcribe(
    app_handle: tauri::AppHandle,
    options: TranscribeOptions,
    sona_state: State<'_, Mutex<SonaState>>,
) -> Result<Transcript> {
    let state = sona_state.lock().await;
    let process = state.process.as_ref();
    if process.is_none() {
        bail!("Please load model first")
    }
    let sona = process.unwrap();

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    let app_handle_c = app_handle.clone();
    app_handle.listen("abort_transcribe", move |_| {
        let _ = set_progress_bar(&app_handle_c, None);
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let start = std::time::Instant::now();

    let stream = sona.transcribe_stream(&options).await?;

    tokio::pin!(stream);

    let mut segments = Vec::new();

    while let Some(event_result) = stream.next().await {
        if abort_atomic.load(Ordering::Relaxed) {
            tracing::debug!("transcription aborted by user");
            break;
        }

        match event_result {
            Ok(event) => match event {
                SonaEvent::Progress { progress } => {
                    let _ = set_progress_bar(&app_handle, Some(progress.into()));
                }
                SonaEvent::Segment { start, end, text, speaker } => {
                    let segment = Segment {
                        start: (start * 100.0) as i64,
                        stop: (end * 100.0) as i64,
                        text,
                        speaker,
                    };
                    app_handle.emit_to("main", "new_segment", segment.clone()).log_error();
                    segments.push(segment);
                }
                SonaEvent::Result { .. } => {
                    tracing::debug!("transcription complete");
                }
                SonaEvent::Error { message } => {
                    tracing::error!("sona transcription error: {}", message);
                    bail!("transcription error: {}", message);
                }
            },
            Err(e) => {
                tracing::error!("stream error: {:?}", e);
            }
        }
    }

    let _ = set_progress_bar(&app_handle, None);

    let elapsed = start.elapsed();
    let transcript = Transcript {
        processing_time_sec: elapsed.as_secs(),
        segments,
    };

    Ok(transcript)
}

#[tauri::command]
pub fn get_path_dst(src: String, suffix: String) -> Result<String> {
    let src = PathBuf::from(src);
    let src_filename = src.file_name().context("filename")?.to_str().context("stostr")?;
    let src_name = src
        .file_stem()
        .map(|name| name.to_str().context("tosstr"))
        .unwrap_or(Ok(src_filename))?;

    let parent = src.parent().context("parent")?;
    let mut dst_path = parent.join(format!("{}{}", src_name, suffix));

    let mut counter = 1;
    while dst_path.exists() {
        dst_path = parent.join(format!("{} ({}){}", src_name, counter, suffix));
        counter += 1;
    }
    Ok(dst_path.to_str().context("tostr")?.into())
}

#[tauri::command]
pub fn get_save_path(src_path: PathBuf, target_ext: &str) -> Result<Value> {
    let stem = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
    let mut new_path = src_path.clone();
    new_path.set_file_name(stem);
    new_path.set_extension(target_ext);
    let new_filename = new_path.file_name().map(|s| s.to_str()).unwrap_or(Some("Untitled"));
    let new_path = new_path.to_str().context("to_str")?;
    let named_path = json!({"name": new_filename, "path": new_path});
    Ok(named_path)
}

#[tauri::command]
pub fn get_argv() -> Vec<String> {
    std::env::args().collect()
}

#[tauri::command]
pub async fn open_path(path: PathBuf) -> Result<()> {
    showfile::show_path_in_file_manager(path);
    Ok(())
}

#[tauri::command]
pub fn get_cuda_version() -> String {
    String::new()
}

#[tauri::command]
pub fn get_rocm_version() -> String {
    String::new()
}

#[tauri::command]
pub fn is_avx2_enabled() -> bool {
    true
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

    let spawn_sona = |no_gpu: bool| -> Result<crate::sona::SonaProcess> {
        let binary_path = resolve_sona_binary(&app_handle)?;
        let ffmpeg_path = resolve_ffmpeg_path(&app_handle);
        let diarize_path = resolve_diarize_path(&app_handle);
        crate::sona::SonaProcess::spawn(&binary_path, ffmpeg_path.as_deref(), diarize_path.as_deref(), no_gpu)
    };

    // Spawn sona if not running
    if state_guard.process.is_none() {
        match spawn_sona(false) {
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
        sona.load_model(&model_path, gpu_device).await
    };

    let gpu_fallback = match load_result {
        Ok(()) => false,
        Err(e) => {
            // Fallback to CPU if GPU was enabled and model load failed for any reason:
            // - sona process crashed (GPU driver issue)
            // - sona returned an error (whisper.cpp failed to init with GPU)
            let should_fallback = {
                let sona = state_guard.process.as_mut().unwrap();
                !sona.no_gpu()
            };
            if should_fallback {
                tracing::warn!("model load failed with GPU enabled, falling back to CPU: {:#}", e);

                // Kill existing process (dead or alive) and respawn with --no-gpu
                if let Some(mut old) = state_guard.process.take() {
                    old.kill();
                }
                let process = spawn_sona(true).context("failed to respawn sona with --no-gpu")?;
                state_guard.process = Some(process);

                let sona = state_guard.process.as_mut().unwrap();
                sona.load_model(&model_path, gpu_device).await?;
                true
            } else {
                return Err(e);
            }
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
        let process = crate::sona::SonaProcess::spawn(&binary_path, ffmpeg_path.as_deref(), diarize_path.as_deref(), false)?;
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

#[tauri::command]
pub fn track_analytics_event(app_handle: tauri::AppHandle, name: String, props: Option<Value>) -> Result<()> {
    crate::analytics::track_event_handle_with_props(&app_handle, &name, props);
    Ok(())
}

#[tauri::command]
#[allow(clippy::comparison_to_empty)]
pub fn is_portable() -> bool {
    env!("WINDOWS_PORTABLE") == "1"
}

#[tauri::command]
pub fn get_logs_folder(app_handle: tauri::AppHandle) -> Result<PathBuf> {
    let config_path = if is_portable() {
        get_current_dir()?
    } else {
        app_handle.path().app_config_dir()?
    };
    Ok(config_path)
}

#[tauri::command]
pub async fn show_log_path(app_handle: tauri::AppHandle) -> Result<()> {
    let log_path = crate::logging::get_log_path(&app_handle)?;
    if log_path.exists() {
        showfile::show_path_in_file_manager(log_path);
    } else if let Some(parent) = log_path.parent() {
        showfile::show_path_in_file_manager(parent);
    }
    Ok(())
}

#[tauri::command]
pub async fn show_temp_path() -> Result<()> {
    let temp_path = audio_utils::get_vibe_temp_folder();
    showfile::show_path_in_file_manager(temp_path);
    Ok(())
}

#[tauri::command]
pub fn get_models_folder(app_handle: tauri::AppHandle) -> Result<PathBuf> {
    let store = app_handle.store(STORE_FILENAME)?;

    let models_folder = store.get("models_folder").and_then(|p| p.as_str().map(PathBuf::from));
    if let Some(models_folder) = models_folder {
        tracing::debug!("models folder: {:?}", models_folder);
        return Ok(models_folder);
    }
    if is_portable() {
        return get_current_dir();
    }
    let path = app_handle.path().app_local_data_dir().context("Can't get data directory")?;
    Ok(path)
}

#[tauri::command]
pub fn get_logs(app_handle: tauri::AppHandle) -> Result<String> {
    let path = crate::logging::get_log_path(&app_handle)?;
    let content = std::fs::read_to_string(path)?;
    Ok(content)
}

#[tauri::command]
pub fn is_crashed_recently() -> bool {
    tracing::debug!(
        "checking path {}",
        audio_utils::get_vibe_temp_folder().join("crash.txt").display()
    );
    audio_utils::get_vibe_temp_folder().join("crash.txt").exists()
}

#[tauri::command]
pub fn rename_crash_file() -> Result<()> {
    std::fs::rename(
        audio_utils::get_vibe_temp_folder().join("crash.txt"),
        audio_utils::get_vibe_temp_folder().join("crash.1.txt"),
    )
    .context("Can't delete file")
}

#[tauri::command]
pub fn type_text(text: String) -> Result<()> {
    use enigo::{Enigo, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| eyre::eyre!("Failed to create enigo: {}", e))?;
    // Small delay to let the user's key release propagate
    std::thread::sleep(std::time::Duration::from_millis(100));
    enigo.text(&text).map_err(|e| eyre::eyre!("Failed to type text: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_cargo_features() -> Vec<String> {
    Vec::new()
}
