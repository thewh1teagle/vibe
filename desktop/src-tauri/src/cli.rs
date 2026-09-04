use eyre::Result;
use std::io::{BufRead, BufReader};
use std::process;
use tauri::AppHandle;

use crate::cmd::server_cmd::{resolve_ffmpeg_path, resolve_server_binary};

/// Passed only by the autostart registration. It must not put the app in CLI mode: this is still
/// the normal GUI application, just without an initially visible window.
pub const AUTOSTART_ARG: &str = "--hidden";

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
    is_cli_args(std::env::args().skip(1))
}

pub fn is_background_launch() -> bool {
    is_background_args(std::env::args().skip(1))
}

fn is_cli_args(args: impl IntoIterator<Item = String>) -> bool {
    args.into_iter().any(|arg| arg != AUTOSTART_ARG)
}

fn is_background_args(args: impl IntoIterator<Item = String>) -> bool {
    let args = args.into_iter().collect::<Vec<_>>();
    args.len() == 1 && args[0] == AUTOSTART_ARG
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

/// Forward all CLI args to the bundled server binary.
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

    let server_binary = resolve_server_binary(app_handle)?;
    let ffmpeg_path = resolve_ffmpeg_path(app_handle);

    // Forward all args after the executable name to server
    let args: Vec<String> = std::env::args().skip(1).collect();

    let mut cmd = std::process::Command::new(&server_binary);
    cmd.args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(ref ffmpeg) = ffmpeg_path {
        cmd.env("VIBE_SERVER_FFMPEG_PATH", ffmpeg);
    }

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            crate::analytics::track_event_handle_with_props(
                app_handle,
                crate::analytics::events::CLI_SPAWN_FAILED,
                Some(serde_json::json!({
                    "subcommand": subcommand,
                    "error_message": format!("failed to spawn server: {}", e),
                })),
            );
            crate::analytics::flush_events_bounded(app_handle, std::time::Duration::from_secs(2));
            return Err(eyre::eyre!("failed to spawn server: {}", e));
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

    let status = child.wait().map_err(|e| eyre::eyre!("failed to wait for server: {}", e))?;
    let _ = stdout_thread.join();
    let _ = stderr_thread.join();

    crate::analytics::track_event_handle_with_props(
        app_handle,
        crate::analytics::events::CLI_FINISHED,
        Some(serde_json::json!({
            "subcommand": subcommand,
            // `None` on unix means server was killed by a signal.
            "exit_code": status.code(),
            "duration_ms": started_at.elapsed().as_millis() as u64,
        })),
    );

    // Bounded, and it also no-ops when analytics are not configured.
    crate::analytics::flush_events_bounded(app_handle, std::time::Duration::from_secs(5));
    app_handle.cleanup_before_exit();
    process::exit(status.code().unwrap_or(1));
}

#[cfg(test)]
mod tests {
    use super::{is_background_args, is_cli_args, AUTOSTART_ARG};

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn autostart_flag_is_a_hidden_gui_launch() {
        assert!(is_background_args(args(&[AUTOSTART_ARG])));
        assert!(!is_cli_args(args(&[AUTOSTART_ARG])));
    }

    #[test]
    fn regular_arguments_still_select_cli_mode() {
        assert!(!is_background_args(args(&["transcribe"])));
        assert!(is_cli_args(args(&["transcribe"])));
        assert!(is_cli_args(args(&[AUTOSTART_ARG, "transcribe"])));
    }

    #[test]
    fn no_arguments_is_a_visible_gui_launch() {
        assert!(!is_background_args(args(&[])));
        assert!(!is_cli_args(args(&[])));
    }
}
