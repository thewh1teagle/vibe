use eyre::Result;
use std::process;
use tauri::AppHandle;

use crate::cmd::{resolve_ffmpeg_path, resolve_sona_binary};

/// Attach to console if cli detected in Windows
#[cfg(all(windows, not(debug_assertions)))]
pub fn attach_console() {
    use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    let attach_result = unsafe { AttachConsole(ATTACH_PARENT_PROCESS) };
    if attach_result.is_ok() {
        unsafe {
            let conout = std::ffi::CString::new("CONOUT$").expect("CString::new failed");
            let stdout = libc_stdhandle::stdout();
            let stderr = libc_stdhandle::stderr();
            let mode = std::ffi::CString::new("w").unwrap();
            libc::freopen(conout.as_ptr(), mode.as_ptr(), stdout);
            libc::freopen(conout.as_ptr(), mode.as_ptr(), stderr);
        }
        tracing::debug!("CLI detected. attached console successfully");
    } else {
        tracing::debug!("No CLI detected.");
    }
}

pub fn is_cli_detected() -> bool {
    std::env::args().nth(1).is_some()
}

/// Forward all CLI args to the bundled sona binary.
/// Uses the same resolve functions as the GUI to test identical behavior.
pub async fn run(app_handle: &AppHandle) -> Result<()> {
    #[cfg(target_os = "macos")]
    crate::dock::set_dock_visible(false);

    let sona_binary = resolve_sona_binary(app_handle)?;
    let ffmpeg_path = resolve_ffmpeg_path(app_handle);

    // Forward all args after the executable name to sona
    let args: Vec<String> = std::env::args().skip(1).collect();

    let mut cmd = std::process::Command::new(&sona_binary);
    cmd.args(&args)
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit());

    if let Some(ref ffmpeg) = ffmpeg_path {
        cmd.env("SONA_FFMPEG_PATH", ffmpeg);
    }

    let status = cmd.status().map_err(|e| eyre::eyre!("failed to spawn sona: {}", e))?;

    app_handle.cleanup_before_exit();
    process::exit(status.code().unwrap_or(1));
}
