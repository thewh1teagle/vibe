use eyre::Result;
use std::path::PathBuf;

#[tauri::command]
pub async fn open_path(path: PathBuf) -> Result<()> {
    showfile::show_path_in_file_manager(path);
    Ok(())
}
