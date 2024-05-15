use std::sync::Mutex;
use tauri::{App, Manager};

use crate::crash_log;

pub struct OpenedUrls(pub Mutex<Option<Vec<url::Url>>>);

pub fn setup(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    crash_log::set_crash_hook(app.app_handle());

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
