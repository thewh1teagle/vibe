use tauri::{
	menu::{Menu, MenuItem},
	tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
	Manager, Runtime,
};

pub fn create_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
	let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
	let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

	let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

	let _ = TrayIconBuilder::with_id("main-tray")
		.icon(app.default_window_icon().unwrap().clone())
		.menu(&menu)
		.on_menu_event(move |app, event| {
			match event.id.as_ref() {
				"quit" => {
					app.exit(0);
				}
				"show" => {
					if let Some(window) = app.get_webview_window("main") {
						let _ = window.show();
						let _ = window.set_focus();
					}
				}
				_ => {}
			}
		})
		.on_tray_icon_event(|tray, event| {
			if let TrayIconEvent::Click {
				button: MouseButton::Left,
				button_state: MouseButtonState::Up,
				..
			} = event
			{
				let app = tray.app_handle();
				if let Some(window) = app.get_webview_window("main") {
					let _ = window.show();
					let _ = window.set_focus();
				}
			}
		})
		.build(app)?;

	Ok(())
}
