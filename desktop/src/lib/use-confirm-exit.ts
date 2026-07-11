import { useEffect } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { m } from '~/paraglide/messages.js'
import { UnlistenFn } from '@tauri-apps/api/event'

export function useConfirmExit(shouldConfirm: boolean) {
	useEffect(() => {
		let unlistenFn: UnlistenFn | null = null
		getCurrentWebviewWindow()
			.listen('tauri://close-requested', async () => {
				if (shouldConfirm) {
					if (await confirm(m.confirmExit())) {
						getCurrentWebviewWindow().destroy()
					}
				} else {
					getCurrentWebviewWindow().destroy()
				}
			})
			.then((unlisten) => {
				unlistenFn = unlisten
			})
		return () => unlistenFn?.()
	}, [shouldConfirm])
}
