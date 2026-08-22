import { useEffect } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { exit } from '@tauri-apps/plugin-process'
import { m } from '~/paraglide/messages.js'
import { UnlistenFn } from '@tauri-apps/api/event'

/**
 * Owns what the window's close button does. With "keep running in the tray" on, closing hides the
 * window and the app stays alive for global dictation; otherwise it exits, asking first when a
 * transcription would be lost. Quitting from the tray goes through `app.exit` and never lands here.
 */
export function useConfirmExit(closeToTray: boolean, shouldConfirm: boolean) {
	useEffect(() => {
		let unlistenFn: UnlistenFn | null = null
		const currentWindow = getCurrentWebviewWindow()
		currentWindow
			.onCloseRequested(async (event) => {
				if (closeToTray) {
					event.preventDefault()
					// Leaving the window open is the safer failure: quitting unasked would lose work.
					await currentWindow.hide().catch((error) => console.error('failed to hide the window:', error))
					return
				}
				if (shouldConfirm) {
					event.preventDefault()
					if (await confirm(m.confirmExit())) {
						await exit(0)
					}
				} else {
					await exit(0)
				}
			})
			.then((unlisten) => {
				unlistenFn = unlisten
			})
		return () => unlistenFn?.()
	}, [closeToTray, shouldConfirm])
}
