import { useEffect } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useTranslation } from 'react-i18next'
import { UnlistenFn } from '@tauri-apps/api/event'

export function useConfirmExit(shouldConfirm: boolean) {
	const { t } = useTranslation()
	useEffect(() => {
		let unlistenFn: UnlistenFn | null = null
		getCurrentWebviewWindow()
			.listen('tauri://close-requested', async () => {
				if (shouldConfirm) {
					if (await confirm(t('common.confirm-exit'))) {
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
