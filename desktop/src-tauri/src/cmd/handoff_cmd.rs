//! Tauri commands controlling the phone endpoint and its saved devices.

use serde::Serialize;
use tauri::State;
use tokio::sync::Mutex;

use super::CommandError;
use crate::handoff::{self, devices, HandoffState};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffStatus {
    pub enabled: bool,
    pub endpoint_id: Option<String>,
    pub pairing_url: Option<String>,
    pub pairing_id: Option<String>,
    pub devices: Vec<devices::PairedDevice>,
}

impl HandoffStatus {
    fn snapshot(app: &tauri::AppHandle, state: Option<&HandoffState>) -> Result<Self, CommandError> {
        let (invitation, devices) = devices::snapshot(app)?;
        let endpoint_id = state.map(HandoffState::endpoint_id);
        Ok(Self {
            enabled: state.is_some(),
            pairing_url: endpoint_id
                .as_ref()
                .map(|id| handoff::format_pairing_url(&handoff::pwa_origin(), id, &invitation)),
            pairing_id: state.map(|_| handoff::pairing_id(&invitation)),
            endpoint_id,
            devices,
        })
    }
}

pub type HandoffRuntime = Mutex<Option<HandoffState>>;

#[tauri::command]
pub async fn handoff_status(
    app_handle: tauri::AppHandle,
    runtime: State<'_, HandoffRuntime>,
) -> Result<HandoffStatus, CommandError> {
    let guard = runtime.lock().await;
    HandoffStatus::snapshot(&app_handle, guard.as_ref())
}

#[tauri::command]
pub async fn handoff_start(
    app_handle: tauri::AppHandle,
    runtime: State<'_, HandoffRuntime>,
) -> Result<HandoffStatus, CommandError> {
    let mut guard = runtime.lock().await;
    if guard.is_none() {
        let state = handoff::spawn(app_handle.clone()).await?;
        tracing::info!("handoff started: {}", state.endpoint_id());
        crate::analytics::track_event_handle(&app_handle, crate::analytics::events::HANDOFF_ENABLED);
        handoff::set_enabled(&app_handle, true);
        *guard = Some(state);
    }
    HandoffStatus::snapshot(&app_handle, guard.as_ref())
}

#[tauri::command]
pub async fn handoff_stop(app_handle: tauri::AppHandle, runtime: State<'_, HandoffRuntime>) -> Result<(), CommandError> {
    let mut guard = runtime.lock().await;
    handoff::set_enabled(&app_handle, false);
    if let Some(state) = guard.take() {
        state.shutdown().await;
        tracing::info!("handoff stopped");
        crate::analytics::track_event_handle(&app_handle, crate::analytics::events::HANDOFF_DISABLED);
    }
    Ok(())
}

/// Refresh only the invitation. Saved phones keep their own credentials.
#[tauri::command]
pub async fn handoff_regenerate_token(
    app_handle: tauri::AppHandle,
    runtime: State<'_, HandoffRuntime>,
) -> Result<HandoffStatus, CommandError> {
    let guard = runtime.lock().await;
    devices::refresh_invitation(&app_handle)?;
    crate::analytics::track_event_handle_with_props(
        &app_handle,
        crate::analytics::events::HANDOFF_PAIRING_REGENERATED,
        Some(serde_json::json!({ "was_running": guard.is_some() })),
    );
    HandoffStatus::snapshot(&app_handle, guard.as_ref())
}

#[tauri::command]
pub async fn handoff_revoke_device(
    app_handle: tauri::AppHandle,
    runtime: State<'_, HandoffRuntime>,
    device_id: String,
) -> Result<HandoffStatus, CommandError> {
    let guard = runtime.lock().await;
    devices::revoke(&app_handle, &device_id)?;
    if let Some(state) = guard.as_ref() {
        state.authorization_changed();
    }
    HandoffStatus::snapshot(&app_handle, guard.as_ref())
}

#[tauri::command]
pub async fn handoff_revoke_all(
    app_handle: tauri::AppHandle,
    runtime: State<'_, HandoffRuntime>,
) -> Result<HandoffStatus, CommandError> {
    let guard = runtime.lock().await;
    devices::revoke_all(&app_handle)?;
    if let Some(state) = guard.as_ref() {
        state.authorization_changed();
    }
    HandoffStatus::snapshot(&app_handle, guard.as_ref())
}
