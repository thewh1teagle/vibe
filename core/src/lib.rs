pub mod audio;
pub mod config;
pub mod downloader;
pub mod transcribe;
pub mod transcript;

#[cfg(test)]
mod test;

pub fn get_vibe_temp_folder() -> std::path::PathBuf {
    use chrono::Local;
    let current_datetime = Local::now();
    let formatted_datetime = current_datetime.format("%Y-%m-%d").to_string();
    let dir = std::env::temp_dir().join(format!("vibe_temp_{}", formatted_datetime));
    if let Ok(_) = std::fs::create_dir_all(&dir) {
        return dir;
    }
    std::env::temp_dir()
}
