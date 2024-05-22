use crate::{deep_link, panic_hook};
use tauri::{App, Manager};

pub fn setup(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    // Add panic hook
    panic_hook::set_panic_hook(app.app_handle());

    // Log some useful data
    if let Ok(version) = tauri::webview_version() {
        log::debug!("webview version: {}", version);
    }
    let is_support_f16c = std::is_x86_feature_detected!("f16c");
    log::debug!("CPU supports f16c: {}", is_support_f16c);

    // Add deep links from argv as tauri::State
    deep_link::create_state(app);
    Ok(())
}
