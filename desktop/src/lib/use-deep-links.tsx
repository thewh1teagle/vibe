import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { ModifyState, NamedPath } from './types'
import { pathToNamedPath } from './fs'
import { isDownloadLink } from './model-deep-link'
import { handleDownloadLink } from './model-deep-link-handler'
import * as config from '~/lib/config'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import * as os from '@tauri-apps/plugin-os'
import { invoke } from '@tauri-apps/api/core'

interface UseDeepLinksProps {
	setFiles: ModifyState<NamedPath[]>
}

export function useDeepLinks({ setFiles }: UseDeepLinksProps) {
	const navigate = useNavigate()

	async function processURLs(urls: string[]): Promise<void> {
		const newFiles: NamedPath[] = []
		for (let url of urls) {
			if (isDownloadLink(url)) {
				await handleDownloadLink(url, navigate)
				break
			} else if (config.videoExtensions.some((e) => url.endsWith(e)) || config.audioExtensions.some((e) => url.endsWith(e))) {
				url = url.replace('file://', '')
				url = decodeURIComponent(url)
				const newFile = await pathToNamedPath(url)
				newFiles.push(newFile)
			}
		}
		setFiles(newFiles)
	}

	async function handleArgv() {
		const argv = await invoke<string[]>('get_argv')
		await processURLs(argv)
	}

	async function handleDeepLinks() {
		const platform = await os.platform()
		if (['windows', 'linux'].includes(platform)) {
			return
		}
		onOpenUrl(async (urls) => {
			await processURLs(urls)
		})
	}

	useEffect(() => {
		handleArgv()
		handleDeepLinks()
	}, [])
}
