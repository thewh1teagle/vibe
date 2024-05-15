use tauri::App;

pub fn setup(_app: &App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(any(windows, target_os = "linux"))]
    {
        // NOTICE: `args` may include URL protocol (`your-app-protocol://`) or arguments (`--`) if app supports them.
        let mut urls = Vec::new();
        for arg in env::args().skip(1) {
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
