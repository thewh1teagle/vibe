import { useTranslation } from 'react-i18next'
import { ModifyState, NamedPath } from './utils'
import { ask } from '@tauri-apps/plugin-dialog'
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'

interface UseSingleInstanceProps {
	files: NamedPath[]
	setFiles: ModifyState<NamedPath[]>
}

export function useSingleInstance({ files: _files, setFiles: _setFiles }: UseSingleInstanceProps) {
	const { t } = useTranslation()

	async function handleSingleInstance() {
		await listen<string[]>('single-instance', async (event) => {
			const argv = event.payload
			console.log('argv => ', argv)
			let action = argv?.[1]

			// vibe://download/?url=google.com
			if (action && action.startsWith('vibe://download/?')) {
				const params = new URLSearchParams(action.replace('vibe://download/?', ''))
				const url = params.get('url')
				if (url) {
					const hostname = new URL(url).hostname
					await ask(`${t('common.ask-for-download-model')} ${hostname}?`, { title: t('common.download-model'), kind: 'info' })
				}
			}
		})
	}

	useEffect(() => {
		handleSingleInstance()
	}, [])
}
