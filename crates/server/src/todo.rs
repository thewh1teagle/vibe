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
pub fn is_crashed_recently() -> bool {
    tracing::debug!("checking path {}", get_vibe_temp_folder().join("crash.txt").display());
    get_vibe_temp_folder().join("crash.txt").exists()
}

#[tauri::command]
pub fn rename_crash_file() -> Result<()> {
    std::fs::rename(
        get_vibe_temp_folder().join("crash.txt"),
        // TODO: save all crashed?
        get_vibe_temp_folder().join("crash.1.txt"),
    )
    .context("Can't delete file")
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


pub fn screencapturekit_to_wav(output_path: PathBuf) -> Result<()> {
    // TODO: convert to wav
    // ffmpeg -f f32le -ar 48000 -ac 1 -i output0.raw -f f32le -ar 48000 -ac 1 -i output1.raw -filter_complex "[0:a][1:a]amerge=inputs=2" -ac 2 output.wav
    let base_path = get_vibe_temp_folder();
    let output_0 = base_path.join(format!("output{}.raw", 0));
    let output_1 = base_path.join(format!("output{}.raw", 1));
    let mut pid = Command::new(find_ffmpeg_path().context("no ffmpeg")?)
        .args([
            "-y",
            "-f",
            "f32le",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-i",
            &output_0.to_string_lossy(),
            "-f",
            "f32le",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-i",
            &output_1.to_string_lossy(),
            "-filter_complex",
            "[0:a][1:a]amerge=inputs=2",
            "-ac",
            "2",
            &output_path.to_string_lossy(),
            "-hide_banner",
            "-y",
            "-loglevel",
            "error",
        ])
        .stdin(Stdio::null())
        .spawn()
        .context("failed to execute process")?;
    if !pid.wait().context("wait")?.success() {
        bail!("unable to convert file")
    }
    tracing::info!("COMPLETED - {}", output_path.display());
    Ok(())
}
