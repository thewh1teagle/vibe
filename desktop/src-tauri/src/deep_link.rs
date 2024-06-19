use std::sync::Mutex;
use tauri::{App, Manager};

pub struct OpenedUrls(pub Mutex<Option<Vec<url::Url>>>);

pub fn create_state(app: &App) {
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
}
