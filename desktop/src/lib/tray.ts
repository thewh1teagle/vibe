import { invoke } from '@tauri-apps/api/core'
import { useEffect } from 'react'
import { m } from '~/paraglide/messages.js'

/**
 * Keeps the system tray in step with the setting.
 *
 * The tray only exists while "keep running in the tray" is on, and its menu is built in Rust — which
 * has no translations — so the labels travel with every call. That also means a language change
 * re-labels the menu, since this runs again when the messages change.
 */
export function useTray(enabled: boolean, locale: string) {
	useEffect(() => {
		void invoke('set_tray', {
			enabled,
			labels: { show: m.trayShow(), hide: m.trayHide(), quit: m.trayQuit() },
		}).catch((error) => console.error('failed to update the tray:', error))
	}, [enabled, locale])
}
