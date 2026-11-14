import { ModifyState, NamedPath } from './types'
import { pathToNamedPath } from './fs'
import { isDownloadLink } from './model-deep-link'
import { handleDownloadLink } from './model-deep-link-handler'
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'
import * as config from '~/lib/config'
import * as os from '@tauri-apps/plugin-os'

interface UseSingleInstanceProps {
	setFiles: ModifyState<NamedPath[]>
}

export function useSingleInstance({ setFiles }: UseSingleInstanceProps) {
	const navigate = useNavigate()

	async function handleSingleInstance() {
		const platform = await os.platform()
		await listen<string[]>('single-instance', async (event) => {
			const argv = event.payload
			const action = argv?.[1]

			// vibe://download/?url=<model address>; macOS gets it through the deep-link plugin instead.
			if (action && isDownloadLink(action) && platform != 'macos') {
				await handleDownloadLink(action, navigate)
			}
			// if not action, probably it's open with action
			const newFiles: NamedPath[] = []
			for (const arg of argv) {
				if (config.audioExtensions.some((e) => arg.endsWith(e)) || config.videoExtensions.some((e) => arg.endsWith(e))) {
					newFiles.push(await pathToNamedPath(arg))
				}
			}
			if (newFiles.length > 0) {
				setFiles([...newFiles])
			}
		})
	}

	useEffect(() => {
		handleSingleInstance()
	}, [])
}
