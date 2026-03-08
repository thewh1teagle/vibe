import { invoke } from '@tauri-apps/api/core'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { platform } from '@tauri-apps/plugin-os'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as config from '~/lib/config'
import { NamedPath } from '~/lib/types'
import { ls } from '~/lib/fs'
import { getIssueUrl, resetApp } from '~/lib/app'
import { usePreferenceProvider } from '~/providers/preference'
import { UnlistenFn, listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'
import { load } from '@tauri-apps/plugin-store'
import { useStoreValue } from '~/lib/use-store-value'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { collectLogs, getPrettyVersion } from '~/lib/logs'

export interface GpuDevice {
	index: number
	name: string
	description: string
	type: string
}

async function openModelPath() {
	let dst = await invoke<string>('get_models_folder')
	invoke('open_path', { path: dst })
}

async function openModelsUrl() {
	openUrl(config.modelsDocURL)
}

async function reportIssue() {
	try {
		let info = await collectLogs()

		const logs: string = await invoke<string>('get_logs')
		const filteredLogs = logs
			.split('\n')
			.filter((l) => l.toLowerCase().includes('error')) // Filter lines with "debug"
			.slice(-10) // Take the last 3 lines
			.map((line) => {
				try {
					const parsed = JSON.parse(line) // Deserialize JSON
					return parsed?.fields?.message || 'No message found' // Extract .message or fallback
				} catch (e) {
					return 'Invalid JSON' // Handle invalid JSON
				}
			})
			.join('\n')
		const templatedLogs = `<details>
<summary>logs</summary>

\`\`\`console
${filteredLogs}
\`\`\`
</details>
`
		info += `\n\n\n${templatedLogs}`
		openUrl(await getIssueUrl(info))
	} catch (e) {
		console.error(e)
		openUrl(await getIssueUrl(`Couldn't get info ${e}`))
	}
}

async function revealLogs() {
	await invoke<string>('show_log_path')
}

async function revealTemp() {
	await invoke<string>('show_temp_path')
}

async function copyLogs() {
	const logs = await invoke<string>('get_logs')
	const templated = `<details>
<summary>logs</summary>

\`\`\`console
${logs}
\`\`\`
</details>
`
	clipboard.writeText(templated)
}

export function viewModel() {
	const [isLogToFileSet, setLogToFile] = useStoreValue<boolean>('prefs_log_to_file')

	const [models, setModels] = useState<NamedPath[]>([])
	const [appVersion, setAppVersion] = useState('')
	const [defaultRecordingPath, setDefaultRecordingPath] = useState<string>('')
	const preference = usePreferenceProvider()
	const { t } = useTranslation()
	const listenersRef = useRef<UnlistenFn[]>([])
	const [downloadURL, setDownloadURL] = useState('')
	const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null)
	const [isStartingApiServer, setIsStartingApiServer] = useState(false)
	const [isStoppingApiServer, setIsStoppingApiServer] = useState(false)
	const [gpuDevices, setGpuDevices] = useState<GpuDevice[]>([])
	const isMacOS = platform() === 'macos'
	const navigate = useNavigate()

	async function askAndReset() {
		const yes = await ask(t('common.reset-ask-dialog'), { kind: 'info' })
		if (yes) {
			resetApp()
		}
	}

	async function downloadModel() {
		if (!downloadURL) {
			return
		}
		navigate('/setup', { state: { downloadURL } })
	}

	async function loadMeta() {
		try {
			const prettyVersion = await getPrettyVersion()
			setAppVersion(prettyVersion)
		} catch (e) {
			console.error(e)
		}
	}

	async function loadModels() {
		const modelsFolder = await invoke<string>('get_models_folder')
		const entries = await ls(modelsFolder)
		const found = entries.filter((e) => e.name?.endsWith('.bin'))
		setModels(found)
	}

	async function getDefaultModel() {
		if (!preference.modelPath) {
			const modelsFolder = await invoke<string>('get_models_folder')

			let files = await ls(modelsFolder)
			files = files.filter((f) => f.name.endsWith('.bin'))
			if (files) {
				const defaultModelPath = files?.[0].path
				preference.setModelPath(defaultModelPath as string)
			}
		}
	}

	async function changeRecordingPath() {
		const path = await open({ directory: true, multiple: false })
		if (path) {
			preference.setCustomRecordingPath(path)
		}
	}

	async function resetRecordingPath() {
		preference.setCustomRecordingPath(null)
	}

	async function changeModelsFolder() {
		const path = await open({ directory: true, multiple: false })
		if (path) {
			const store = await load(config.storeFilename)
			await store.set('models_folder', path)
			await store.save()
			await loadModels()
			await getDefaultModel()
		}
	}

	async function onWindowFocus() {
		listenersRef.current.push(await listen('tauri://focus', loadModels))
		listenersRef.current.push(await listen('tauri://focus', refreshApiServerStatus))
	}

	async function loadGpuDevices() {
		try {
			const devices = await invoke<GpuDevice[]>('get_gpu_devices')
			setGpuDevices(devices)
		} catch (error) {
			console.error(error)
			setGpuDevices([])
		}
	}

	async function refreshApiServerStatus() {
		try {
			const baseUrl = await invoke<string | null>('get_api_base_url')
			setApiBaseUrl(baseUrl)
		} catch (error) {
			console.error(error)
			setApiBaseUrl(null)
		}
	}

	async function startApiServer() {
		try {
			setIsStartingApiServer(true)
			const baseUrl = await invoke<string>('start_api_server')
			setApiBaseUrl(baseUrl)
		} catch (error) {
			console.error(error)
		} finally {
			setIsStartingApiServer(false)
		}
	}

	async function stopApiServer() {
		try {
			setIsStoppingApiServer(true)
			await invoke<boolean>('stop_api_server')
			setApiBaseUrl(null)
		} catch (error) {
			console.error(error)
		} finally {
			setIsStoppingApiServer(false)
		}
	}

	useEffect(() => {
		loadMeta()
		loadModels()
		getDefaultModel()
		refreshApiServerStatus()
		loadGpuDevices()
		onWindowFocus()
		invoke<string>('get_default_recording_path').then(setDefaultRecordingPath).catch(console.error)
		return () => {
			listenersRef.current.forEach((unlisten) => unlisten())
		}
	}, [])

	return {
		copyLogs,
		isLogToFileSet,
		setLogToFile,
		downloadModel,
		downloadURL,
		setDownloadURL,
		apiBaseUrl,
		isStartingApiServer,
		isStoppingApiServer,
		startApiServer,
		stopApiServer,
		refreshApiServerStatus,
		preference: preference,
		askAndReset,
		openModelPath,
		openModelsUrl,
		revealLogs,
		revealTemp,
		models,
		appVersion,
		reportIssue,
		loadModels,
		changeModelsFolder,
		changeRecordingPath,
		resetRecordingPath,
		defaultRecordingPath,
		gpuDevices,
		isMacOS,
	}
}
