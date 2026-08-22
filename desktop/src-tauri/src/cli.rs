use eyre::Result;
use std::io::{BufRead, BufReader};
use std::process;
use tauri::AppHandle;

use crate::cmd::sona_cmd::{resolve_ffmpeg_path, resolve_sona_binary};

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

/// The subcommand name from argv[1], and nothing else: anything that could be a path,
/// a flag, or a value is reported as "other" so no user input reaches analytics.
fn subcommand_name() -> String {
    let looks_like_subcommand = |arg: &String| {
        !arg.is_empty()
            && arg.len() <= 32
            && arg
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
            && !arg.starts_with('-')
    };
    std::env::args()
        .nth(1)
        .filter(looks_like_subcommand)
        .unwrap_or_else(|| "other".to_string())
}

/// Forward all CLI args to the bundled sona binary.
/// Uses the same resolve functions as the GUI to test identical behavior.
pub async fn run(app_handle: &AppHandle) -> Result<()> {
    #[cfg(target_os = "macos")]
    crate::dock::set_dock_visible(false);

    let subcommand = subcommand_name();
    let started_at = std::time::Instant::now();
    crate::analytics::track_event_handle_with_props(
        app_handle,
        crate::analytics::events::CLI_STARTED,
        Some(serde_json::json!({ "subcommand": subcommand })),
    );

    let sona_binary = resolve_sona_binary(app_handle)?;
    let ffmpeg_path = resolve_ffmpeg_path(app_handle);

    // Forward all args after the executable name to sona
    let args: Vec<String> = std::env::args().skip(1).collect();

    let mut cmd = std::process::Command::new(&sona_binary);
    cmd.args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(ref ffmpeg) = ffmpeg_path {
        cmd.env("SONA_FFMPEG_PATH", ffmpeg);
    }

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            crate::analytics::track_event_handle_with_props(
                app_handle,
                crate::analytics::events::CLI_SPAWN_FAILED,
                Some(serde_json::json!({
                    "subcommand": subcommand,
                    "error_message": format!("failed to spawn sona: {}", e),
                })),
            );
            crate::analytics::flush_events_bounded(app_handle, std::time::Duration::from_secs(2));
            return Err(eyre::eyre!("failed to spawn sona: {}", e));
        }
    };

    // Pipe stdout in a thread so it works even without an inherited console (Windows)
    let stdout = child.stdout.take();
    let stdout_thread = std::thread::spawn(move || {
        if let Some(out) = stdout {
            for line in BufReader::new(out).lines().map_while(|l| l.ok()) {
                println!("{}", line);
            }
        }
    });

    let stderr = child.stderr.take();
    let stderr_thread = std::thread::spawn(move || {
        if let Some(err) = stderr {
            for line in BufReader::new(err).lines().map_while(|l| l.ok()) {
                eprintln!("{}", line);
            }
        }
    });

    let status = child.wait().map_err(|e| eyre::eyre!("failed to wait for sona: {}", e))?;
    let _ = stdout_thread.join();
    let _ = stderr_thread.join();

    crate::analytics::track_event_handle_with_props(
        app_handle,
        crate::analytics::events::CLI_FINISHED,
        Some(serde_json::json!({
            "subcommand": subcommand,
            // `None` on unix means sona was killed by a signal.
            "exit_code": status.code(),
            "duration_ms": started_at.elapsed().as_millis() as u64,
        })),
    );

    // Bounded, and it also no-ops when analytics are not configured.
    crate::analytics::flush_events_bounded(app_handle, std::time::Duration::from_secs(5));
    app_handle.cleanup_before_exit();
    process::exit(status.code().unwrap_or(1));
}
