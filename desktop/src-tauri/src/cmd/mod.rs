use crate::config::{DEAFULT_MODEL_FILENAME, DEAFULT_MODEL_URL, STORE_FILENAME};
use crate::setup::ModelContext;
use crate::utils::{get_current_dir, LogError};
use eyre::{bail, eyre, Context, ContextCompat, OptionExt, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
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
use vibe_core::transcript::Segment;
use vibe_core::transcript::Transcript;
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
                    // It works in Windows without it, and setting it causes it to jump every time.
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
pub async fn download_model(app_handle: tauri::AppHandle, url: Option<String>) -> Result<String> {
    let model_path = if let Some(url) = url.clone() {
        let filename = vibe_core::downloader::get_filename(&url).await?;
        tracing::debug!("url filename is {}", filename);
        get_models_folder(app_handle.clone())?.join(filename)
    } else {
        get_models_folder(app_handle.clone())?.join(DEAFULT_MODEL_FILENAME)
    };

    let mut downloader = vibe_core::downloader::Downloader::new();
    tracing::debug!("Download model invoked! with path {}", model_path.display());

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    let app_handle_c = app_handle.clone();

    // allow abort transcription
    let app_handle_d = app_handle_c.clone();
    app_handle.listen("abort_download", move |_| {
        set_progress_bar(&app_handle_d, None).log_error();
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let download_progress_callback = {
        let app_handle = app_handle.clone();
        let abort_atomic = abort_atomic.clone();

        move |current: u64, total: u64| {
            let app_handle = app_handle.clone();

            // Update progress in background
            tauri::async_runtime::spawn(async move {
                let percentage = (current as f64 / total as f64) * 100.0;
                tracing::debug!("percentage: {}", percentage);
                if let Err(e) = set_progress_bar(&app_handle, Some(percentage)) {
                    tracing::error!("Failed to set progress bar: {}", e);
                }
                if let Some(window) = app_handle.get_webview_window("main") {
                    if let Err(e) = window.emit("download_progress", (current, total)) {
                        tracing::error!("Failed to emit download progress: {}", e);
                    }
                }
            });
            // Return the abort signal immediately
            abort_atomic.load(Ordering::Relaxed)
        }
    };

    let download_url = if let Some(url) = url {
        url
    } else {
        DEAFULT_MODEL_URL.to_string()
    };

    downloader
        .download(&download_url, model_path.to_owned(), download_progress_callback)
        .await?;
    set_progress_bar(&app_handle_c, None)?;
    Ok(model_path.to_str().context("to_str")?.to_string())
}

#[tauri::command]
pub fn get_ffmpeg_path() -> String {
    vibe_core::audio::find_ffmpeg_path()
        .map(|p| p.to_str().unwrap().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn download_file(app_handle: tauri::AppHandle, url: String, path: String) -> Result<()> {
    let mut downloader = vibe_core::downloader::Downloader::new();
    tracing::debug!("Download model invoked! with path {}", path);

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    let app_handle_c = app_handle.clone();

    // allow abort transcription
    let app_handle_d = app_handle_c.clone();
    app_handle.listen("abort_download", move |_| {
        set_progress_bar(&app_handle_d, None).log_error();
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let download_progress_callback = {
        let app_handle = app_handle.clone();
        let abort_atomic = abort_atomic.clone();

        move |current: u64, total: u64| {
            let app_handle = app_handle.clone();

            // Update progress in background
            tauri::async_runtime::spawn(async move {
                let percentage = (current as f64 / total as f64) * 100.0;
                tracing::debug!("percentage: {}", percentage);
                if let Some(window) = app_handle.get_webview_window("main") {
                    if let Err(e) = window.emit("download_progress", (current, total)) {
                        tracing::error!("Failed to emit download progress: {}", e);
                    }
                }
            });
            // Return the abort signal immediately
            abort_atomic.load(Ordering::Relaxed)
        }
    };

    downloader.download(&url, path.into(), download_progress_callback).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiarizeOptions {
    threshold: f32,
    max_speakers: usize,
    enabled: bool,
}

impl Default for DiarizeOptions {
    fn default() -> Self {
        DiarizeOptions {
            enabled: false,
            threshold: 0.0,
            max_speakers: 0,
        }
    }
}

#[tauri::command]
pub async fn transcribe(
    app_handle: tauri::AppHandle,
    options: vibe_core::config::TranscribeOptions,
    model_context_state: State<'_, Mutex<Option<ModelContext>>>,
    diarize_options: DiarizeOptions,
) -> Result<Transcript> {
    let model_context = model_context_state.lock().await;
    if model_context.is_none() {
        bail!("Please load model first")
    }
    let ctx = model_context.as_ref().context("as ref")?;
    let app_handle_c = app_handle.clone();

    let new_segment_callback = move |segment: Segment| {
        app_handle_c
            .clone()
            .emit_to("main", "new_segment", segment)
            .map_err(|e| eyre!("{:?}", e))
            .log_error();
    };
    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_atomic_c = abort_atomic.clone();

    // allow abort transcription
    let app_handle_c = app_handle.clone();
    app_handle.listen("abort_transcribe", move |_| {
        let _ = set_progress_bar(&app_handle_c, None);
        abort_atomic_c.store(true, Ordering::Relaxed);
    });

    let abort_callback = move || abort_atomic.load(Ordering::Relaxed);

    let app_handle_c = app_handle.clone();
    let app_handle_c1 = app_handle.clone();
    let progress_callback = move |progress: i32| {
        // tracing::debug!("desktop progress is {}", progress);
        let _ = set_progress_bar(&app_handle, Some(progress.into()));
    };

    // prevent panic crash. sometimes whisper.cpp crash without nice errors.

    let mut core_diarize_options = None;
    if diarize_options.enabled {
        let embedding_model_path = get_models_folder(app_handle_c1.clone())?
            .join(crate::config::EMBEDDING_MODEL_FILENAME)
            .to_str()
            .ok_or_eyre("tostr")?
            .to_string();

        let segment_model_path = get_models_folder(app_handle_c1.clone())?
            .join(crate::config::SEGMENT_MODEL_FILENAME)
            .to_str()
            .ok_or_eyre("tostr")?
            .to_string();
        core_diarize_options = Some(vibe_core::transcribe::DiarizeOptions {
            embedding_model_path,
            segment_model_path,
            max_speakers: diarize_options.max_speakers,
            threshold: diarize_options.threshold,
        });
    }
    let unwind_result = catch_unwind(AssertUnwindSafe(|| {
        vibe_core::transcribe::transcribe(
            &ctx.handle,
            &options,
            Some(Box::new(progress_callback)),
            Some(Box::new(new_segment_callback)),
            Some(Box::new(abort_callback)),
            core_diarize_options,
        )
    }));

    let _ = set_progress_bar(&app_handle_c, None);
    match unwind_result {
        Err(error) => {
            bail!("transcribe crash: {:?}", error)
        }
        Ok(transcribe_result) => {
            let transcript = transcribe_result.with_context(|| format!("options: {:?}", options))?;
            Ok(transcript)
        }
    }
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

    // Ensure we don't overwrite existing file
    let mut counter = 0;
    while dst_path.exists() {
        dst_path = parent.join(format!("{} ({}){}", src_name, counter, suffix));
        counter += 1;
    }
    Ok(dst_path.to_str().context("tostr")?.into())
}

#[tauri::command]
#[cfg(windows)]
pub fn set_high_gpu_preference(mode: bool) -> Result<()> {
    if mode {
        crate::gpu_preference::set_gpu_preference_high()?;
    } else {
        crate::gpu_preference::remove_gpu_preference()?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_save_path(src_path: PathBuf, target_ext: &str) -> Result<Value> {
    // Get the file stem (filename without extension)
    let stem = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();

    // Create a new path with the same directory and the new extension
    let mut new_path = src_path.clone();
    new_path.set_file_name(stem);
    new_path.set_extension(target_ext);
    let new_filename = new_path.file_name().map(|s| s.to_str()).unwrap_or(Some("Untitled"));
    // Convert the new path to a string
    let new_path = new_path.to_str().context("to_str")?;
    let named_path = json!({"name": new_filename, "path": new_path});
    Ok(named_path)
}

#[tauri::command]
pub fn get_argv() -> Vec<String> {
    std::env::args().collect()
}

#[tauri::command]
/// Opens folder or open folder of a file
pub async fn open_path(path: PathBuf) -> Result<()> {
    if path.is_file() {
        showfile::show_path_in_file_manager(path);
    } else {
        open::that(path)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_cuda_version() -> String {
    env!("CUDA_VERSION").to_string()
}

#[tauri::command]
pub fn get_rocm_version() -> String {
    env!("ROCM_VERSION").to_string()
}

#[tauri::command]
pub fn is_avx2_enabled() -> bool {
    #[allow(clippy::comparison_to_empty)]
    return env!("WHISPER_NO_AVX") != "ON";
}

#[tauri::command]
pub async fn load_model(app_handle: tauri::AppHandle, model_path: String, gpu_device: Option<i32>) -> Result<String> {
    let model_context_state: State<'_, Mutex<Option<ModelContext>>> = app_handle.state();
    let mut state_guard = model_context_state.lock().await;
    if let Some(state) = state_guard.as_ref() {
        // check if new path is different
        if model_path != state.path || gpu_device != state.gpu_device {
            tracing::debug!("model path or gpu device changed. reloading");
            // reload
            let context = vibe_core::transcribe::create_context(Path::new(&model_path), gpu_device)?;
            *state_guard = Some(ModelContext {
                path: model_path.clone(),
                handle: context,
                gpu_device,
            });
        }
    } else {
        tracing::debug!("loading model first time");
        let context = vibe_core::transcribe::create_context(Path::new(&model_path), gpu_device)?;
        *state_guard = Some(ModelContext {
            path: model_path.clone(),
            handle: context,
            gpu_device,
        });
    }
    Ok(model_path)
}

#[tauri::command]
#[allow(clippy::comparison_to_empty)]
pub fn is_portable() -> bool {
    env!("WINDOWS_PORTABLE") == "1"
}

#[tauri::command]
pub fn check_vulkan() -> Result<()> {
    #[cfg(all(feature = "vulkan", windows))]
    {
        use ash::vk;
        unsafe {
            let entry = match ash::Entry::load() {
                Ok(e) => e,
                Err(e) => {
                    tracing::error!("Failed to load Vulkan entry: {:?}", e);
                    return Err(e.into());
                }
            };

            let app_desc = vk::ApplicationInfo::default().api_version(vk::make_api_version(0, 1, 0, 0));
            let instance_desc = vk::InstanceCreateInfo::default().application_info(&app_desc);

            let instance = match entry.create_instance(&instance_desc, None) {
                Ok(inst) => inst,
                Err(e) => {
                    tracing::error!("Failed to create Vulkan instance: {:?}", e);
                    return Err(e.into());
                }
            };

            instance.destroy_instance(None);
            tracing::debug!("Vulkan support is successfully checked and working.");
        }
        Ok(())
    }
    #[cfg(not(all(feature = "vulkan", windows)))]
    {
        tracing::debug!("Vulkan check skipped on this platform");
        Ok(())
    }
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
pub fn get_cargo_features() -> Vec<String> {
    let mut enabled_features = Vec::new();

    if cfg!(feature = "cuda") {
        enabled_features.push("cuda".to_string());
    }
    if cfg!(feature = "coreml") {
        enabled_features.push("coreml".to_string());
    }
    if cfg!(feature = "metal") {
        enabled_features.push("metal".to_string());
    }
    if cfg!(feature = "openblas") {
        enabled_features.push("openblas".to_string());
    }
    if cfg!(feature = "vulkan") {
        enabled_features.push("vulkan".to_string());
    }
    if cfg!(feature = "rocm") {
        enabled_features.push("rocm".to_string());
    }

    enabled_features
}
