use crate::{
    cmd::is_portable,
    config,
    utils::{get_current_dir, LogError},
};
use chrono::Local;
use eyre::{eyre, Context, Result};
use std::{panic, path::PathBuf, sync::Arc};
use tauri::{AppHandle, Manager};

fn get_log_path(app: &AppHandle) -> Result<PathBuf> {
    let config_path = if is_portable() {
        get_current_dir()?
    } else {
        app.path().app_config_dir()?
    };

    let current_datetime = Local::now();
    let formatted_datetime = current_datetime.format("%Y-%m-%d-%H-%M-%S").to_string();
    let log_filename = format!("{}_{}.txt", config::CRASH_LOG_FILENAME_PREFIX, formatted_datetime);
    let log_path = config_path.join(log_filename);

    Ok(log_path)
}

pub fn set_panic_hook(app: &AppHandle) -> Result<()> {
    let log_path = get_log_path(app)?;
    let log_path = Arc::new(log_path);

    panic::set_hook(Box::new(move |info| {
        let log_path = log_path.clone();
        let mut message = String::new();
        message.push_str(&format!("thread '{}' ", std::thread::current().name().unwrap_or("unknown")));
        message.push_str(&format!("{}", info));
        if let Ok(var) = std::env::var("RUST_BACKTRACE") {
            if var == "1" {
                let backtrace = std::backtrace::Backtrace::capture();
                message.push_str(&format!("{}", backtrace));
            }
        }
        eprintln!("{}", message);
        // do whatever with the message
        std::fs::write(log_path.as_path(), format!("{}\nCOMMIT: {}", message, env!("COMMIT_HASH")))
            .context("write")
            .context("write")
            .map_err(|e| eyre!("{:?}", e))
            .log_error();
        // Open the log path in release mode
        if !cfg!(debug_assertions) && !crate::cli::is_cli_detected() {
            showfile::show_path_in_file_manager(log_path.as_path());
        }
    }));
    Ok(())
}
