//! Stable and beta update channels. See `docs/UPDATER.md`.
//!
//! The app reads `updater/<channel>.json` from the website rather than GitHub's latest release.
//! Each file is the `latest.json` a release build produced. The plugin's own `check()` can only use
//! the endpoint in `tauri.conf.json`, so picking the channel at runtime happens here.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

const CHANNELS_URL: &str = "https://thewh1teagle.github.io/vibe/updater";

const PROGRESS_EVENT: &str = "updater-progress";

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Stable,
    Beta,
}

impl Channel {
    fn url(self) -> String {
        let name = match self {
            Channel::Stable => "stable",
            Channel::Beta => "beta",
        };
        format!("{CHANNELS_URL}/{name}.json")
    }
}

/// The update `update_check` found, held until the user installs it.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<(Update, Option<Vec<u8>>)>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    version: String,
    current_version: String,
    body: Option<String>,
}

#[derive(Clone, Serialize)]
struct Progress {
    chunk: usize,
    total: Option<u64>,
}

#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    channel: Channel,
) -> Result<Option<AvailableUpdate>, String> {
    let url = channel.url().parse().map_err(|e| format!("{e:?}"))?;
    let update = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;

    let mut guard = pending.0.lock().await;
    *guard = None;
    let Some(update) = update else {
        return Ok(None);
    };
    let available = AvailableUpdate {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        body: update.body.clone(),
    };
    *guard = Some((update, None));
    Ok(Some(available))
}

/// Downloads the pending update, reporting each chunk as `updater-progress`.
#[tauri::command]
pub async fn update_download(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = match pending.0.lock().await.as_ref() {
        Some((update, _)) => update.clone(),
        None => return Err("no update to download".into()),
    };
    let bytes = update
        .download(
            |chunk, total| {
                let _ = app.emit(PROGRESS_EVENT, Progress { chunk, total });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    if let Some((_, slot)) = pending.0.lock().await.as_mut() {
        *slot = Some(bytes);
    }
    Ok(())
}

/// Installs what `update_download` fetched. Split from it so the caller can stop the server in
/// between: Windows cannot replace a running `vibe-server.exe`.
#[tauri::command]
pub async fn update_install(pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let Some((update, Some(bytes))) = pending.0.lock().await.take() else {
        return Err("no downloaded update to install".into());
    };
    update.install(bytes).map_err(|e| e.to_string())
}
