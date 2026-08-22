//! Tauri commands controlling the phone handoff endpoint.
//!
//! The endpoint is off by default; nothing binds until the user calls
//! `handoff_start`.

use serde::Serialize;
use tauri::State;
use tokio::sync::Mutex;

use crate::handoff::{self, HandoffState};

use super::CommandError;

/// What the UI needs to render the handoff panel and its QR code.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffStatus {
    pub enabled: bool,
    pub endpoint_id: Option<String>,
    pub pairing_url: Option<String>,
}

impl HandoffStatus {
    fn disabled() -> Self {
        Self {
            enabled: false,
            endpoint_id: None,
            pairing_url: None,
        }
    }

    fn from_state(state: &HandoffState) -> Self {
        Self {
            enabled: true,
            endpoint_id: Some(state.endpoint_id()),
            pairing_url: Some(state.pairing_url(&handoff::pwa_origin())),
        }
    }
}

/// Managed state holding the running endpoint, if any.
pub type HandoffRuntime = Mutex<Option<HandoffState>>;

#[tauri::command]
pub async fn handoff_status(runtime: State<'_, HandoffRuntime>) -> Result<HandoffStatus, CommandError> {
    let guard = runtime.lock().await;
    Ok(match guard.as_ref() {
        Some(state) => HandoffStatus::from_state(state),
        None => HandoffStatus::disabled(),
    })
}

/// Idempotent: returns the existing endpoint if one is already running.
#[tauri::command]
pub async fn handoff_start(
    app_handle: tauri::AppHandle,
    runtime: State<'_, HandoffRuntime>,
) -> Result<HandoffStatus, CommandError> {
    let mut guard = runtime.lock().await;
    if let Some(state) = guard.as_ref() {
        return Ok(HandoffStatus::from_state(state));
    }

    let state = handoff::spawn(app_handle.clone()).await?;
    tracing::info!("handoff started: {}", state.endpoint_id());
    // Only on a real off -> on transition, so this counts adoption rather than
    // how often the settings page was opened. Never carries the endpoint id.
    crate::analytics::track_event_handle(&app_handle, crate::analytics::events::HANDOFF_ENABLED);
    // Persist the intent so enabling handoff survives a restart.
    handoff::set_enabled(&app_handle, true);
    let status = HandoffStatus::from_state(&state);
    *guard = Some(state);
    Ok(status)
}

#[tauri::command]
pub async fn handoff_stop(app_handle: tauri::AppHandle, runtime: State<'_, HandoffRuntime>) -> Result<(), CommandError> {
    let taken = { runtime.lock().await.take() };
    // Recorded even when nothing was running, so a restore that failed at startup
    // cannot leave the stored preference stuck on.
    handoff::set_enabled(&app_handle, false);
    if let Some(state) = taken {
        state.shutdown().await;
        tracing::info!("handoff stopped");
        // Likewise only on a real on -> off transition.
        crate::analytics::track_event_handle(&app_handle, crate::analytics::events::HANDOFF_DISABLED);
    }
    Ok(())
}

/// Issues a new pairing token, invalidating any QR code already handed out.
/// If the endpoint is running it is restarted so the new token takes effect.
#[tauri::command]
pub async fn handoff_regenerate_token(
    app_handle: tauri::AppHandle,
    runtime: State<'_, HandoffRuntime>,
) -> Result<HandoffStatus, CommandError> {
    let mut guard = runtime.lock().await;
    handoff::regenerate_token(&app_handle)?;

    let was_running = guard.is_some();
    // Rare, and a signal that someone is fighting with pairing. No token or
    // endpoint id goes with it.
    crate::analytics::track_event_handle_with_props(
        &app_handle,
        crate::analytics::events::HANDOFF_PAIRING_REGENERATED,
        Some(serde_json::json!({ "was_running": was_running })),
    );
    if let Some(state) = guard.take() {
        state.shutdown().await;
    }
    if !was_running {
        return Ok(HandoffStatus::disabled());
    }

    let state = handoff::spawn(app_handle).await?;
    let status = HandoffStatus::from_state(&state);
    *guard = Some(state);
    Ok(status)
}
