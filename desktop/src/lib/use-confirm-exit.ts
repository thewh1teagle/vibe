import { useEffect } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { exit } from '@tauri-apps/plugin-process'
import { m } from '~/paraglide/messages.js'
import { UnlistenFn } from '@tauri-apps/api/event'

export function useConfirmExit(shouldConfirm: boolean) {
	useEffect(() => {
		let unlistenFn: UnlistenFn | null = null
		getCurrentWebviewWindow()
			.listen('tauri://close-requested', async () => {
				if (shouldConfirm) {
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
	}, [shouldConfirm])
}
