// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde_json;
use std::path::PathBuf;

#[tauri::command]
async fn transcribe(path: &str, lang: &str) -> Result<serde_json::Value, String> {
    let model = vibe::config::get_model_path().map_err(|e| e.to_string())?;
    let options = vibe::config::ModelArgs {
        lang: Some(lang.to_owned()),
        model,
        path: PathBuf::from(path),
        n_threads: None,
        verbose: false,
    };
    let text = vibe::model::transcribe(&options).map_err(|e| e.to_string())?;
    let value = serde_json::json!({"text": text});
    return Ok(value);
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![transcribe])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
