import { useEffect } from 'react'
import * as webview from '@tauri-apps/api/webview'
import { saveWindowState, StateFlags, restoreStateCurrent } from '@tauri-apps/plugin-window-state'
import { Window } from '@tauri-apps/api/window'

export function useWindowsState() {
	async function setup() {
		// Visible only after first render called from React
		// With extra timeout to ensure smoothness
		setTimeout(async () => {
			await restoreStateCurrent(StateFlags.ALL & ~StateFlags.VISIBLE)
			const currentWindow = webview.getCurrent().window
			if (!(await currentWindow.isVisible())) {
				// ensure it always visible
				await currentWindow.show()
				if (!(await currentWindow.isFocused())) {
					await currentWindow.setFocus()
				}
			}
		}, 100)

		// Store window state
		Window.getCurrent().onCloseRequested(async (_event) => {
			await saveWindowState(StateFlags.ALL & ~StateFlags.VISIBLE)
		})
	}
	useEffect(() => {
		setup()
	}, [])
}
