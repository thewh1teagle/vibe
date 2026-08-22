use eyre::{ContextCompat, Result};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn glob_files(folder: String, patterns: Vec<String>, recursive: bool) -> Vec<String> {
    let mut files = Vec::new();

    let search_pattern = if recursive {
        format!("{}/**/*", folder)
    } else {
        format!("{}/*", folder)
    };

    match glob::glob(&search_pattern) {
        Ok(paths) => {
            for entry in paths.filter_map(Result::ok) {
                if entry.is_file() {
                    if let Some(file_name) = entry.file_name().and_then(|n| n.to_str()) {
                        if patterns.iter().any(|p| file_name.ends_with(p)) {
                            if let Ok(path_str) = entry.into_os_string().into_string() {
                                files.push(path_str);
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to read pattern {}: {}", search_pattern, e);
        }
    }

    files
}

#[tauri::command]
pub fn get_path_dst(src: String, suffix: String) -> Result<String> {
    let src = PathBuf::from(src);
    let src_filename = src.file_name().context("filename")?.to_str().context("stostr")?;
    let src_name = src
        .file_stem()
        .map(|name| name.to_str().context("tosstr"))
        .unwrap_or(Ok(src_filename))?;

    let parent = src.parent().context("parent")?;
    let mut dst_path = parent.join(format!("{}{}", src_name, suffix));

    let mut counter = 1;
    while dst_path.exists() {
        dst_path = parent.join(format!("{} ({}){}", src_name, counter, suffix));
        counter += 1;
    }
    Ok(dst_path.to_str().context("tostr")?.into())
}

pub(crate) fn sanitize_filename_stem(input: &str) -> String {
    input
        .trim()
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>()
        .trim_matches([' ', '.'])
        .to_string()
}

pub(crate) fn available_path(parent: &Path, stem: &str, extension: &str) -> PathBuf {
    let extension = extension.trim_start_matches('.');
    let mut path = parent.join(format!("{stem}.{extension}"));
    let mut counter = 1;

    while path.exists() {
        path = parent.join(format!("{stem} ({counter}).{extension}"));
        counter += 1;
    }

    path
}

#[tauri::command]
pub fn get_save_path(src_path: PathBuf, target_ext: &str) -> Result<Value> {
    let stem = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
    let mut new_path = src_path.clone();
    new_path.set_file_name(stem);
    new_path.set_extension(target_ext);
    let new_filename = new_path.file_name().map(|s| s.to_str()).unwrap_or(Some("Untitled"));
    let new_path = new_path.to_str().context("to_str")?;
    let named_path = json!({"name": new_filename, "path": new_path});
    Ok(named_path)
}

#[tauri::command]
pub fn get_argv() -> Vec<String> {
    std::env::args().collect()
}

#[tauri::command]
pub fn get_default_recording_path(app_handle: AppHandle) -> Result<String> {
    let path = app_handle
        .path()
        .document_dir()
        .map_err(|e| eyre::eyre!("{e:?}"))?
        .join(crate::config::DOCUMENTS_SUBFOLDER);
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn open_path(path: PathBuf) -> Result<()> {
    showfile::show_path_in_file_manager(path);
    Ok(())
}

#[tauri::command]
pub fn get_ffmpeg_path() -> String {
    crate::ffmpeg::find_ffmpeg_path()
        .map(|p| p.to_str().unwrap().to_string())
        .unwrap_or_default()
}

/// Media picker that accepts files *and* folders in one dialog.
///
/// Only macOS' open panel can offer both at once (`NSOpenPanel` takes two independent flags); the
/// dialog plugin — and the cross-platform picker it wraps — is one or the other. Elsewhere this
/// returns `None` so the caller falls back to the plugin's file dialog.
#[tauri::command]
pub async fn pick_media_paths(app_handle: AppHandle, extensions: Vec<String>) -> Result<Option<Vec<String>>> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        app_handle.run_on_main_thread(move || {
            let _ = sender.send(macos_open_panel(&extensions));
        })?;
        Ok(receiver.await?)
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Nothing to open here; the caller falls back to the plugin dialog.
        let _ = (app_handle, extensions);
        Ok(None)
    }
}

/// `None` when the user cancelled. Must run on the main thread — AppKit panels are modal there.
#[cfg(target_os = "macos")]
fn macos_open_panel(extensions: &[String]) -> Option<Vec<String>> {
    use objc2::rc::Retained;
    use objc2_app_kit::NSOpenPanel;
    use objc2_foundation::{MainThreadMarker, NSArray, NSString};

    const NS_MODAL_RESPONSE_OK: isize = 1;

    let mtm = MainThreadMarker::new()?;
    let panel = NSOpenPanel::openPanel(mtm);
    panel.setCanChooseFiles(true);
    panel.setCanChooseDirectories(true);
    panel.setAllowsMultipleSelection(true);

    // The filter applies to files only; folders stay selectable whatever it says.
    if !extensions.is_empty() {
        let types: Vec<Retained<NSString>> = extensions.iter().map(|extension| NSString::from_str(extension)).collect();
        let refs: Vec<&NSString> = types.iter().map(|value| value.as_ref()).collect();
        // Deprecated in favour of UTTypes, but still honoured and it keeps the extension list simple.
        #[allow(deprecated)]
        panel.setAllowedFileTypes(Some(&NSArray::from_slice(&refs)));
    }

    if panel.runModal() != NS_MODAL_RESPONSE_OK {
        return None;
    }

    let mut paths = Vec::new();
    for url in panel.URLs().iter() {
        if let Some(path) = url.path() {
            paths.push(path.to_string());
        }
    }
    Some(paths)
}
