import { useTranslation } from 'react-i18next'
import { ModifyState, NamedPath, pathToNamedPath } from './utils'
import { ask } from '@tauri-apps/plugin-dialog'
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'
import * as config from '~/lib/config'
import * as os from '@tauri-apps/plugin-os'

interface UseSingleInstanceProps {
	setFiles: ModifyState<NamedPath[]>
}

export function useSingleInstance({ setFiles }: UseSingleInstanceProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()

	async function handleSingleInstance() {
		const platform = await os.platform()
		await listen<string[]>('single-instance', async (event) => {
			const argv = event.payload
			let action = argv?.[1]

			// vibe://download/?url=google.com
			// already handled in deep links in macos
			if (action && action.startsWith('vibe://download/?') && platform != 'macos') {
				const params = new URLSearchParams(action.replace('vibe://download/?', ''))
				const url = params.get('url')
				if (url) {
					const downloadURL = url.replace('vibe://download/?url=', '')
					const hostname = new URL(url).hostname
					const confirm = await ask(`${t('common.ask-for-download-model')} ${hostname}?`, { title: t('common.download-model'), kind: 'info' })
					if (confirm) {
						navigate('/setup', { state: { downloadURL } })
					}
				}
			}
			// if not action, probably it's open with action
			const newFiles: NamedPath[] = []
			for (const arg of argv) {
				if (config.audioExtensions.some((e) => arg.endsWith(e)) || config.videoExtensions.some((e) => arg.endsWith(e))) {
					newFiles.push(await pathToNamedPath(arg))
				}
			}
			if (newFiles) {
				setFiles([...newFiles])
			}
		})
	}

	useEffect(() => {
		handleSingleInstance()
	}, [])
}
