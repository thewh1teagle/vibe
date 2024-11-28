use eyre::Result;
use std::{panic, sync::Arc};
use tauri::AppHandle;

pub fn set_panic_hook(app: &AppHandle) -> Result<()> {
    let log_path = crate::logging::get_log_path(app)?;
    let log_path = Arc::new(log_path);

    panic::set_hook(Box::new(move |info| {
        let mut message = String::new();
        message.push_str(&format!("thread '{}' ", std::thread::current().name().unwrap_or("unknown")));
        message.push_str(&format!("{}", info));
        if let Ok(var) = std::env::var("RUST_BACKTRACE") {
            if var == "1" {
                let backtrace = std::backtrace::Backtrace::capture();
                message.push_str(&format!("{}", backtrace));
            }
        }
        message.push_str(&format!("\nCOMMIT: {}", env!("COMMIT_HASH")));
        eprintln!("{}", message);
        // do whatever with the message
        tracing::error!(message);
        // Open the log path in release mode
        if !cfg!(debug_assertions) && !crate::cli::is_cli_detected() {
            showfile::show_path_in_file_manager(log_path.as_path());
        }
    }));
    Ok(())
}
