use std::{panic, path::PathBuf, sync::Arc};
use tauri::{AppHandle, Manager};

use crate::config;

fn get_log_path(app: &AppHandle) -> PathBuf {
    let config_path = app.path().app_config_dir().unwrap();
    let mut log_path = config_path.join(format!("{}.txt", config::LOG_FILENAME_PREFIX));
    let mut count = 0;
    while log_path.exists() {
        log_path = config_path.join(format!("{}_{}.txt", config::LOG_FILENAME_PREFIX, count));
        count += 1;
    }
    log_path
}

pub fn set_panic_hook(app: &AppHandle) {
    let log_path = get_log_path(app);
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
        std::fs::write(log_path.as_path(), format!("{}\nCOMMIT: {}", message, env!("COMMIT_HASH"))).unwrap();
    }));
}
