import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { useTranslation } from 'react-i18next'
import { ModifyState, NamedPath, pathToNamedPath } from './utils'
import { ask } from '@tauri-apps/plugin-dialog'
import * as config from '~/lib/config'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import * as os from '@tauri-apps/plugin-os'

interface UseDeepLinksProps {
	files: NamedPath[]
	setFiles: ModifyState<NamedPath[]>
}

export function useDeepLinks({ files, setFiles }: UseDeepLinksProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()

	async function handleDeepLinks() {
		const platform = await os.platform()
		if (['windows', 'linux'].includes(platform)) {
			return
		}
		let newFiles: NamedPath[] = []
		await onOpenUrl(async (urls) => {
			for (let url of urls) {
				if (url.startsWith('vibe://')) {
					const confirm = await ask(t('common.ask-for-download-model'), { kind: 'info', title: t('common.download-model') })
					if (confirm) {
						navigate('/setup', { state: { downloadURL: url } })
					}
				} else if (url.startsWith('file://')) {
					url = decodeURIComponent(url)
					url = url.replace('file://', '')
					// take only the first one
					newFiles.push(await pathToNamedPath(url))
				}
			}
		})
		newFiles = newFiles.filter((f) => {
			const path = f.path.toLowerCase()
			return (
				config.videoExtensions.some((ext) => path.endsWith(ext.toLowerCase())) ||
				config.audioExtensions.some((ext) => path.endsWith(ext.toLowerCase())) ||
				files.includes(f)
			)
		})
		if (newFiles.length > 1) {
			setFiles(newFiles)
		}
		if (newFiles.length === 1) {
			navigate('/', { state: { files: newFiles } })
		}
	}

	useEffect(() => {
		handleDeepLinks()
	}, [])
}
