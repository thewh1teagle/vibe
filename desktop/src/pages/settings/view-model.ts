import { invoke } from '@tauri-apps/api/core'
import { ask, message, open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { platform } from '@tauri-apps/plugin-os'
import { useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { toast } from 'sonner'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import * as fs from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import * as config from '~/lib/config'
import { NamedPath } from '~/lib/types'
import { ls } from '~/lib/fs'
import { getIssueUrl, resetApp } from '~/lib/app'
import { usePreferenceProvider } from '~/providers/preference'
import { useToastProvider } from '~/providers/toast'
import { Claude, Llm, Ollama, OpenAICompatible } from '~/lib/llm'
import { UnlistenFn, listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'
import { load } from '@tauri-apps/plugin-store'
import { useStoreValue } from '~/lib/use-store-value'
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
	const listenersRef = useRef<UnlistenFn[]>([])
	const [downloadURL, setDownloadURL] = useState('')
	const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null)
	const [isStartingApiServer, setIsStartingApiServer] = useState(false)
	const [isStoppingApiServer, setIsStoppingApiServer] = useState(false)
	const [gpuDevices, setGpuDevices] = useState<GpuDevice[]>([])
	const isMacOS = platform() === 'macos'
	const navigate = useNavigate()
	const progressToast = useToastProvider()
	const [llm, setLlm] = useState<Llm | null>(null)
	const [llmError, setLlmError] = useState<string | null>(null)
	const [llmErrorCopied, setLlmErrorCopied] = useState(false)
	const llmErrorCopyTimer = useRef<number | null>(null)

	function parseIntOr(value: string, fallback: number) {
		const n = parseInt(value, 10)
		return Number.isNaN(n) ? fallback : n
	}

	function onEnableLlm() {
		preference.setLlmConfig({ ...preference.llmConfig, enabled: !preference.llmConfig?.enabled })
	}

	async function validateLlmPrompt() {
		const valid = Boolean(preference.llmConfig?.prompt && preference.llmConfig.prompt.includes('%s'))
		if (!valid) {
			await message(m.invalidLlmPrompt(), { kind: 'error' })
		}
		return valid
	}

	async function checkLlm() {
		setLlmError(null)
		try {
			const promise = llm!.ask('Hello, how are you?')
			toast.promise(promise, {
				error: m.checkError() as string,
				success: m.checkSuccess() as string,
				loading: m.checkLoading() as string,
			})
			await promise
		} catch (e) {
			console.error(e)
			setLlmError(String(e))
		}
	}

	function copyLlmError() {
		if (!llmError) return
		clipboard.writeText(llmError)
		setLlmErrorCopied(true)
		if (llmErrorCopyTimer.current) window.clearTimeout(llmErrorCopyTimer.current)
		llmErrorCopyTimer.current = window.setTimeout(() => {
			setLlmErrorCopied(false)
			llmErrorCopyTimer.current = null
		}, 2000)
	}

	async function toggleDiarization(checked: boolean) {
		if (!checked) {
			preference.setDiarizeEnabled(false)
			return
		}
		try {
			const modelsFolder = await invoke<string>('get_models_folder')
			const modelPath = await join(modelsFolder, config.diarizeModelFilename)
			const exists = await fs.exists(modelPath)
			if (exists) {
				preference.setDiarizeEnabled(true)
				return
			}
			const confirmed = await ask(m.downloadDiarizeModel(), { title: m.diarization(), kind: 'info' })
			if (confirmed) {
				progressToast.setMessage(m.downloadingDiarizeModel() as string)
				progressToast.setOpen(true)
				progressToast.setProgress(0)
				try {
					await invoke('download_model', { url: config.diarizeModelUrl, path: modelPath })
					preference.setDiarizeEnabled(true)
					toast.success(m.downloadComplete())
				} finally {
					progressToast.setOpen(false)
					progressToast.setProgress(null)
				}
			}
		} catch (e) {
			console.error('diarization setup failed:', e)
			toast.error(String(e))
		}
	}

	async function handleStableTimestampsToggle(checked: boolean) {
		if (!checked) {
			preference.setStableTimestampsEnabled(false)
			return
		}
		try {
			const modelsFolder = await invoke<string>('get_models_folder')
			const modelPath = await join(modelsFolder, config.vadModelFilename)
			const exists = await fs.exists(modelPath)
			if (exists) {
				preference.setStableTimestampsEnabled(true)
			} else {
				const confirmed = await ask(m.stableTimestampsConfirm(), { title: m.stableTimestamps(), kind: 'info' })
				if (confirmed) {
					progressToast.setMessage(m.downloadingVadModel())
					progressToast.setOpen(true)
					progressToast.setProgress(0)
					try {
						await invoke('download_model', { url: config.vadModelUrl, path: modelPath })
						preference.setStableTimestampsEnabled(true)
						toast.success(m.downloadComplete())
					} finally {
						progressToast.setOpen(false)
						progressToast.setProgress(null)
					}
				}
			}
		} catch (e) {
			console.error('stable timestamps setup failed:', e)
			toast.error(String(e))
		}
	}

	async function askAndReset() {
		const yes = await ask(m.resetAskDialog(), { kind: 'info' })
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

	async function copyCurlExample() {
		if (!apiBaseUrl) return
		const snippet = `curl ${apiBaseUrl}/v1/audio/transcriptions \\
  -F "file=@/path/to/audio.mp3"`
		await clipboard.writeText(snippet)
		toast.success('cURL example copied to clipboard')
	}

	async function copyAgentSkill() {
		if (!apiBaseUrl) return
		try {
			const res = await tauriFetch(`${apiBaseUrl}/skill`)
			const text = await res.text()
			await clipboard.writeText(text)
			toast.success(m.agentInstructionsCopied())
		} catch (error) {
			console.error(error)
			toast.error(m.localApiUnreachable())
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

	useEffect(() => {
		const platform = preference.llmConfig?.platform
		const llmInstance =
			platform === 'ollama' ? new Ollama(preference.llmConfig) : platform === 'openai' ? new OpenAICompatible(preference.llmConfig) : new Claude(preference.llmConfig)
		setLlm(llmInstance)
	}, [preference.llmConfig])

	useEffect(() => {
		return () => {
			if (llmErrorCopyTimer.current) window.clearTimeout(llmErrorCopyTimer.current)
		}
	}, [])

	useEffect(() => {
		const unlisten = listen<[number, number]>('download_progress', (event) => {
			const [current, total] = event.payload
			progressToast.setProgress(Number(current / total) * 100)
		})
		return () => {
			unlisten.then((fn) => fn())
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
		copyCurlExample,
		copyAgentSkill,
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
		llm,
		llmError,
		llmErrorCopied,
		checkLlm,
		copyLlmError,
		onEnableLlm,
		validateLlmPrompt,
		toggleDiarization,
		handleStableTimestampsToggle,
		parseIntOr,
	}
}
