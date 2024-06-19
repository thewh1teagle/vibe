import { useTranslation } from 'react-i18next'
import { ModifyState, NamedPath, pathToNamedPath } from './utils'
import { ask } from '@tauri-apps/plugin-dialog'
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'
import * as config from '~/lib/config'

interface UseSingleInstanceProps {
	files: NamedPath[]
	setFiles: ModifyState<NamedPath[]>
}

export function useSingleInstance({ files, setFiles }: UseSingleInstanceProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()

	async function handleSingleInstance() {
		await listen<string[]>('single-instance', async (event) => {
			const argv = event.payload
			let action = argv?.[1]

			// vibe://download/?url=google.com
			if (action && action.startsWith('vibe://download/?')) {
				const params = new URLSearchParams(action.replace('vibe://download/?', ''))
				const url = params.get('url')
				if (url) {
					const hostname = new URL(url).hostname
					const confirm = await ask(`${t('common.ask-for-download-model')} ${hostname}?`, { title: t('common.download-model'), kind: 'info' })
					if (confirm) {
						console.log('downloading from ', url)
						navigate('/setup', { state: { downloadURL: url } })
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
				setFiles([...files, ...newFiles])
			}
		})
	}

	useEffect(() => {
		handleSingleInstance()
	}, [])
}
