use std::sync::Mutex;
use tauri::{App, Manager};

use crate::panic_hook;

pub struct OpenedUrls(pub Mutex<Option<Vec<url::Url>>>);

pub fn setup(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    // Add panic hook
    panic_hook::set_panic_hook(app.app_handle());

    // Attach console IF:
    // OS is Windows + RUST_LOG was set + attach-console feature was set + console is available.
    #[cfg(all(windows, feature = "attach-console"))]
    crate::attach_console::attach();

    // Log some useful data
    if let Ok(version) = tauri::webview_version() {
        log::debug!("webview version: {}", version);
    }

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
