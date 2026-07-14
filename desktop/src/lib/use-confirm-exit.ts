import { useEffect } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { m } from '~/paraglide/messages.js'
import { UnlistenFn } from '@tauri-apps/api/event'

export function useConfirmExit(closeToTray: boolean, shouldConfirm: boolean) {
	useEffect(() => {
		let unlistenFn: UnlistenFn | null = null
		const currentWindow = getCurrentWebviewWindow()
		currentWindow
			.onCloseRequested(async (event) => {
				if (closeToTray) {
					event.preventDefault()
					await currentWindow.hide()
					return
				}
				if (!shouldConfirm) return
				event.preventDefault()
				if (await confirm(m.confirmExit())) {
					await currentWindow.destroy()
				}
			})
			.then((unlisten) => {
				unlistenFn = unlisten
			})
		return () => unlistenFn?.()
	}, [closeToTray, shouldConfirm])
}
