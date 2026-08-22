//! System tray icon, present only while "close to tray" is switched on.
//!
//! The tray is opt-in: an icon that appears in every user's menu bar or notification area for a
//! feature they never asked for is clutter, so it is built when the setting is enabled and dropped
//! when it is turned off. Its menu labels come from the frontend, which is where the translations
//! live — the backend has none.

use eyre::{eyre, Result};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager,
};

use crate::error::LogError;

/// Menu labels in the app's language, handed over by the frontend.
#[derive(Debug, Deserialize)]
pub struct TrayLabels {
    pub show: String,
    pub hide: String,
    pub quit: String,
}

/// Holds the icon so it lives as long as the app, and so it can be dropped to remove the tray.
#[derive(Default)]
pub struct TrayState(Mutex<Option<TrayIcon>>);

pub fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    window.unminimize().map_err(|error| eyre!("{error:?}")).log_error();
    window.show().map_err(|error| eyre!("{error:?}")).log_error();
    window.set_focus().map_err(|error| eyre!("{error:?}")).log_error();
}

fn hide_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    window.hide().map_err(|error| eyre!("{error:?}")).log_error();
}

/// Build the tray when `enabled`, take it down when not. Safe to call repeatedly — the labels are
/// re-applied on every call, which is how a language change reaches the menu.
pub fn apply(app: &AppHandle, enabled: bool, labels: TrayLabels) -> Result<()> {
    let state = app.state::<TrayState>();
    let mut current = state.0.lock().map_err(|error| eyre!("tray state poisoned: {error}"))?;

    if !enabled {
        // Dropping the icon removes it from the menu bar / notification area.
        *current = None;
        return Ok(());
    }

    let show = MenuItemBuilder::with_id("show", labels.show).build(app)?;
    let hide = MenuItemBuilder::with_id("hide", labels.hide).build(app)?;
    let quit = MenuItemBuilder::with_id("quit", labels.quit).build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &hide, &quit]).build()?;

    if let Some(tray) = current.as_ref() {
        tray.set_menu(Some(menu))?;
        return Ok(());
    }

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| eyre!("the app has no icon to put in the tray"))?;
    let tray = TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("Vibe")
        .menu(&menu)
        // macOS puts the menu on a left click; Windows and Linux expect it to open the window.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_tray_icon_event(|tray, event| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
            if cfg!(target_os = "macos") {
                return;
            }
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "hide" => hide_main_window(app),
            // Exit rather than close the window: the window's close handler hides it instead.
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    *current = Some(tray);
    Ok(())
}

/// Called by the frontend whenever the setting or the app language changes, and once at startup.
#[tauri::command]
pub fn set_tray(app: AppHandle, enabled: bool, labels: TrayLabels) -> Result<()> {
    apply(&app, enabled, labels)
}
