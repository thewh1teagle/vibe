import { invoke } from '@tauri-apps/api/core'
import { ask, message, open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { platform } from '@tauri-apps/plugin-os'
import { useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { toast } from 'sonner'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { join } from '@tauri-apps/api/path'
import * as config from '~/lib/config'
import { NamedPath } from '~/lib/types'
import { getIssueUrl, resetApp } from '~/lib/app'
import { usePreferenceProvider } from '~/providers/preference'
import { useModelGates } from '~/providers/model-gates'
import { useToastProvider } from '~/providers/toast'
import { Claude, Llm, Ollama, OpenAICompatible } from '~/lib/llm'
import { UnlistenFn, listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'
import { load } from '@tauri-apps/plugin-store'
import { useStoreValue } from '~/lib/use-store-value'
import { collectLogs, getPrettyVersion } from '~/lib/logs'
import { cleanupPartialDownloads, isModelFileUsable, listInstalledModels, type InstalledModel, type ModelMetadata } from '~/lib/model'
import { buildSkill, installSkill, type SkillTarget } from '~/lib/skill'

export interface GpuDevice {
	index: number
	name: string
	description: string
	type: string
}

async function openModelPath() {
	const dst = await invoke<string>('get_models_folder')
	invoke('open_path', { path: dst })
}

async function openSelectedModel(path: string | null) {
	if (path) await invoke('open_path', { path })
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
	const [corruptModels, setCorruptModels] = useState<InstalledModel[]>([])
	const [appVersion, setAppVersion] = useState('')
	const [defaultProjectsPath, setDefaultProjectsPath] = useState<string>('')
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
	const modelGates = useModelGates()
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
		const installed = await listInstalledModels()
		const found = installed.filter((model) => model.valid)
		setModels(found)
		setCorruptModels(installed.filter((model) => !model.valid))
		// A file that fails its integrity check is not a model the app can select, even though it
		// sits in the folder with the right extension.
		if (preference.modelPath && !found.some((model) => model.path === preference.modelPath)) {
			preference.setModelPath(null)
		}
	}

	async function getDefaultModel() {
		if (!preference.modelPath) {
			const files = (await listInstalledModels()).filter((model) => model.valid)
			if (files.length > 0) {
				preference.setModelPath(files[0].path)
			}
		}
	}

	/** Replace a broken model in place, so a retry never leaves a second copy next to the bad file. */
	function redownloadModel(model: InstalledModel) {
		navigate('/setup', { state: { replacePath: model.path } })
	}

	async function readModelMetadata(modelPath: string) {
		try {
			return await invoke<ModelMetadata>('get_model_metadata', { modelPath })
		} catch (error) {
			// Unknown GGUF formats may still be loadable by Sona (for example Whisper GGUF).
			console.error('failed to read GGUF metadata:', error)
			return null
		}
	}

	async function ensureRequiredVad(metadata: ModelMetadata | null) {
		if (!metadata?.capabilities.requires_vad) return true
		const modelsFolder = await invoke<string>('get_models_folder')
		const vadPath = await join(modelsFolder, config.vadModelFilename)
		if (await isModelFileUsable(vadPath)) return true

		const confirmed = await ask('Nemotron requires the Silero VAD model. Download it before selecting Nemotron?', {
			title: 'Download required VAD model',
			kind: 'info',
		})
		if (!confirmed) return false

		progressToast.setMessage('Downloading Silero VAD model…')
		progressToast.setOpen(true)
		progressToast.setProgress(0)
		try {
			await invoke('download_model', { url: config.vadModelUrl, path: vadPath })
			toast.success(m.downloadComplete())
			return true
		} finally {
			progressToast.setOpen(false)
			progressToast.setProgress(null)
		}
	}

	function applyModelLanguage(metadata: ModelMetadata | null) {
		if (!metadata) return
		const capabilities = metadata.capabilities
		const currentLanguage = preference.modelOptions.lang
		const isSupported = currentLanguage === 'auto' ? capabilities.language_detection : capabilities.languages.includes(currentLanguage)
		if (isSupported) return
		preference.setModelOptions({
			...preference.modelOptions,
			lang: capabilities.language_detection ? 'auto' : (capabilities.languages[0] ?? 'en'),
		})
	}

	async function selectModel(modelPath: string) {
		const metadata = await readModelMetadata(modelPath)
		if (!(await ensureRequiredVad(metadata))) return
		preference.setModelMetadata(metadata)
		applyModelLanguage(metadata)
		preference.setModelPath(modelPath)
	}

	async function changeProjectsPath() {
		const path = await open({ directory: true, multiple: false })
		if (path) {
			preference.setProjectsPath(path)
		}
	}

	async function resetProjectsPath() {
		preference.setProjectsPath(null)
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
			const baseUrl = await invoke<string>('start_api_server', { unloadTimeoutMinutes: preference.unloadTimeoutMinutes })
			setApiBaseUrl(baseUrl)
		} catch (error) {
			console.error(error)
		} finally {
			setIsStartingApiServer(false)
		}
	}

	async function copyAgentSkill() {
		if (!apiBaseUrl) return
		try {
			await clipboard.writeText(await buildSkill(apiBaseUrl))
			toast.success(m.agentInstructionsCopied())
		} catch (error) {
			console.error(error)
			toast.error(m.localApiUnreachable())
		}
	}

	/** Write the same skill to disk, so every future agent session has it instead of one pasted chat. */
	async function installAgentSkill(target: SkillTarget) {
		if (!apiBaseUrl) return
		try {
			const path = await installSkill(target, apiBaseUrl)
			toast.success(m.agentSkillInstalled({ path }))
		} catch (error) {
			console.error('failed to install the agent skill:', error)
			toast.error(String(error))
		}
	}

	/** Show the settings file in the file manager, so it can be opened, edited or handed to an agent. */
	async function revealConfigFile() {
		try {
			const path = await invoke<string>('get_config_path')
			await invoke('open_path', { path })
		} catch (error) {
			console.error('failed to reveal the config file:', error)
			toast.error(String(error))
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
		// Unresumable leftovers from an interrupted download only take up space.
		cleanupPartialDownloads().then(loadModels).catch(console.error)
		getDefaultModel()
		refreshApiServerStatus()
		loadGpuDevices()
		onWindowFocus()
		invoke<string>('get_default_projects_path').then(setDefaultProjectsPath).catch(console.error)
		return () => {
			listenersRef.current.forEach((unlisten) => unlisten())
		}
	}, [])

	useEffect(() => {
		const platform = preference.llmConfig?.platform
		const llmInstance =
			platform === 'ollama'
				? new Ollama(preference.llmConfig)
				: platform === 'openai'
					? new OpenAICompatible(preference.llmConfig)
					: new Claude(preference.llmConfig)
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
		copyAgentSkill,
		installAgentSkill,
		revealConfigFile,
		preference: preference,
		askAndReset,
		openModelPath,
		openSelectedModel,
		openModelsUrl,
		revealLogs,
		revealTemp,
		models,
		corruptModels,
		redownloadModel,
		appVersion,
		reportIssue,
		loadModels,
		selectModel,
		changeModelsFolder,
		changeProjectsPath,
		resetProjectsPath,
		defaultProjectsPath,
		gpuDevices,
		isMacOS,
		llm,
		llmError,
		llmErrorCopied,
		checkLlm,
		copyLlmError,
		onEnableLlm,
		validateLlmPrompt,
		toggleDiarization: modelGates.toggleDiarization,
		handleStableTimestampsToggle: modelGates.toggleStableTimestamps,
		parseIntOr,
	}
}
