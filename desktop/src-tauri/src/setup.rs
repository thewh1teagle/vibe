use crate::panic_hook;
use std::sync::Mutex;
use tauri::{App, Manager};

pub struct OpenedUrls(pub Mutex<Option<Vec<url::Url>>>);

pub fn setup(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    // Add panic hook
    panic_hook::set_panic_hook(app.app_handle());

    // Log some useful data
    if let Ok(version) = tauri::webview_version() {
        log::debug!("webview version: {}", version);
    }

    let is_support_f16c = std::is_x86_feature_detected!("f16c");
    log::debug!("CPU supports f16c: {}", is_support_f16c);

    app.manage(OpenedUrls(Default::default()));
    #[cfg(any(windows, target_os = "linux"))]
    {
        // NOTICE: `args` may include URL protocol (`your-app-protocol://`) or arguments (`--`) if app supports them.
        let mut urls = Vec::new();
        for arg in std::env::args().skip(1) {
            if let Ok(url) = url::Url::parse(&arg) {
                urls.push(url);
            }
        }

        if !urls.is_empty() {
            app.state::<OpenedUrls>().0.lock().unwrap().replace(urls);
        }
    }
    Ok(())
}
