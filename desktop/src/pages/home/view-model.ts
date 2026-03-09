import '@fontsource/roboto'
import { event, path } from '@tauri-apps/api'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { basename } from '@tauri-apps/api/path'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { SetStateAction, useContext, useEffect, useRef, useState } from 'react'
import { toast as hotToast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocalStorage } from 'usehooks-ts'
import successSound from '~/assets/success.mp3'
import { TextFormat } from '~/components/format-select'
import { AudioDevice } from '~/lib/audio'
import { ensureSystemAudioPermission } from '~/lib/permissions'
import { analyticsEvents, trackAnalyticsEvent } from '~/lib/analytics'
import * as config from '~/lib/config'
import { Claude, Llm, Ollama, OpenAICompatible } from '~/lib/llm'
import { summarizeWithChunking, type ChunkingProgress } from '~/lib/llm/chunking'

function summarizeProgressMessage(p: ChunkingProgress, t: (key: string, opts?: Record<string, unknown>) => string): string {
	if (p.phase === 'chunk') {
		return t('common.summarize-chunk-progress', { current: p.current, total: p.total })
	}
	return t('common.summarize-synthesis')
}
import * as transcript from '~/lib/transcript'
import { isUserError } from '~/lib/sona-errors'
import { useConfirmExit } from '~/lib/use-confirm-exit'
import { NamedPath } from '~/lib/types'
import { ls, pathToNamedPath } from '~/lib/fs'
import { openPath } from '~/lib/app'
import { startKeepAwake, stopKeepAwake } from '~/lib/keep-awake'
import * as ytDlp from '~/lib/ytdlp'
import { ErrorModalContext } from '~/providers/error-modal'
import { useFilesContext } from '~/providers/files-provider'
import { ModelOptions, usePreferenceProvider } from '~/providers/preference'
import { useToastProvider } from '~/providers/toast'
import { UpdaterContext } from '~/providers/updater'
import { hotkeyRecordingActive } from '~/providers/hotkey'

export interface BatchOptions {
	files: NamedPath[]
	format: TextFormat
	modelOptions: ModelOptions
}

export function viewModel() {
	const location = useLocation()
	const [settingsVisible, setSettingsVisible] = useState(location.hash === '#settings')
	const navigate = useNavigate()
	const [loading, setLoading] = useState(false)
	const [isRecording, setIsRecording] = useState(false)
	const abortRef = useRef<boolean>(false)
	const [isAborting, setIsAborting] = useState(false)
	const [segments, setSegments] = useState<transcript.Segment[] | null>(null)
	const [summarizeSegments, setSummarizeSegments] = useState<transcript.Segment[] | null>(null)
	const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
	const [progress, setProgress] = useState<number | null>(0)
	const { t } = useTranslation()
	const toast = useToastProvider()
	const [llm, setLlm] = useState<Llm | null>(null)
	const [transcriptTab, setTranscriptTab] = useLocalStorage<'transcript' | 'summary'>('prefs_transcript_tab', 'transcript')
	useConfirmExit((segments?.length ?? 0) > 0 || loading)

	const { files, setFiles } = useFilesContext()
	const preference = usePreferenceProvider()
	const preferenceRef = useRef(preference)
	const [devices, setDevices] = useState<AudioDevice[]>([])
	const [savedInputDeviceId, setSavedInputDeviceId] = useLocalStorage<string | null>('prefs_input_device_id', null)
	const [savedOutputDeviceId, setSavedOutputDeviceId] = useLocalStorage<string | null>('prefs_output_device_id', null)
	const [inputDevice, setInputDevice] = useState<AudioDevice | null>(null)
	const [outputDevice, setOutputDevice] = useState<AudioDevice | null>(null)
	const [audioUrl, setAudioUrl] = useState<string>('')
	const [downloadingAudio, setDownloadingAudio] = useState(false)
	const [ytdlpProgress, setYtDlpProgress] = useState<number | null>(null)
	const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
	const [isCollectingFolder, setIsCollectingFolder] = useState(false)
	const cancelYtDlpRef = useRef<boolean>(false)
	const switchingToLinkRef = useRef(false)
	const cachedYtDlpVersion = useRef<string | null | undefined>(undefined)
	const skippedYtDlpUpdatePromptRef = useRef(false)

	const { updateApp, availableUpdate } = useContext(UpdaterContext)
	const { setState: setErrorModal } = useContext(ErrorModalContext)

	async function onFilesChanged() {
		if (selectedFolder) {
			setAudio(null)
			return
		}
		if (files.length === 1) {
			setAudio(new Audio(convertFileSrc(files[0].path)))
		}
	}

	async function checkIfCrashedRecently() {
		const isCrashed = await invoke<boolean>('is_crashed_recently')
		if (isCrashed) {
			dialog.message(t('common.crashed-recently'))
			await invoke('rename_crash_file')
		}
	}

	useEffect(() => {
		setFiles([])
		setSelectedFolder(null)
		if (!(files.length === 1)) {
			setAudio(null)
		}
	}, [location])

	useEffect(() => {
		checkIfCrashedRecently()
	}, [])

	useEffect(() => {
		onFilesChanged()
	}, [files, selectedFolder])

	useEffect(() => {
		if (preference.llmConfig?.platform === 'ollama') {
			const llmInstance = new Ollama(preference.llmConfig)
			setLlm(llmInstance)
		} else if (preference.llmConfig?.platform === 'openai') {
			const llmInstance = new OpenAICompatible(preference.llmConfig)
			setLlm(llmInstance)
		} else {
			const llmInstance = new Claude(preference.llmConfig)
			setLlm(llmInstance)
		}
	}, [preference.llmConfig])

	useEffect(() => {
		const unlisten = listen<number>('ytdlp-progress', ({ payload }) => {
			const newProgress = Math.ceil(payload)
			if (!ytdlpProgress || newProgress > ytdlpProgress) {
				setYtDlpProgress(newProgress)
			}
		})
		return () => {
			unlisten.then((fn) => fn())
		}
	}, [])

	useEffect(() => {
		preferenceRef.current = preference
	}, [preference])

	async function cancelYtDlpDownload() {
		cancelYtDlpRef.current = true
		event.emit('ytdlp-cancel')
	}

	async function switchToLinkTab() {
		if (switchingToLinkRef.current) return
		switchingToLinkRef.current = true

		try {
			const binaryExists = await ytDlp.exists()
			let latestVersion: string | null = null

			if (cachedYtDlpVersion.current !== undefined) {
				latestVersion = cachedYtDlpVersion.current
			} else {
				try {
					latestVersion = await ytDlp.getLatestVersion()
					cachedYtDlpVersion.current = latestVersion
				} catch (e) {
					console.error('Failed to fetch latest yt-dlp version', e)
					cachedYtDlpVersion.current = null
					if (binaryExists) {
						preference.setHomeTab("link")
						return
					}
				}
			}

			const needsInstall = !binaryExists
			const needsUpdate = !needsInstall && preference.shouldCheckYtDlpVersion && latestVersion !== null && latestVersion !== preference.ytDlpVersion

			if (needsUpdate && skippedYtDlpUpdatePromptRef.current) {
				preference.setHomeTab("link")
				return
			}

			if (needsInstall || needsUpdate) {
				let shouldInstallOrUpdate = false
				if (needsUpdate) {
					shouldInstallOrUpdate = await dialog.ask(t('common.ask-for-update-ytdlp-message'), {
						title: t('common.ask-for-update-ytdlp-title'),
						kind: 'info',
						cancelLabel: t('common.later'),
						okLabel: t('common.update-now'),
					})
				} else {
					shouldInstallOrUpdate = await dialog.ask(t('common.ask-for-install-ytdlp-message'), {
						title: t('common.ask-for-install-ytdlp-title'),
						kind: 'info',
						cancelLabel: t('common.cancel'),
						okLabel: t('common.install-now'),
					})
				}

				if (shouldInstallOrUpdate) {
					try {
						const versionToDownload = latestVersion ?? preference.ytDlpVersion ?? '2026.02.04'
						toast.setMessage(t('common.downloading-ytdlp'))
						toast.setProgress(0)
						toast.setOpen(true)
						await ytDlp.downloadYtDlp(versionToDownload)
						preference.setYtDlpVersion(versionToDownload)
						skippedYtDlpUpdatePromptRef.current = false
						toast.setOpen(false)
						preference.setHomeTab("link")
					} catch (e) {
						console.error(e)
						setErrorModal?.({ log: String(e), open: true })
					}
				} else if (binaryExists) {
					if (needsUpdate) {
						skippedYtDlpUpdatePromptRef.current = true
					}
					preference.setHomeTab("link")
				}
			} else {
				preference.setHomeTab("link")
			}
		} finally {
			switchingToLinkRef.current = false
		}
	}

	function setupEventListeners(): (() => void) {
		const unlisteners: Promise<() => void>[] = []

		unlisteners.push(
			listen('transcribe_progress', (event) => {
				const value = event.payload as number
				if (value >= 0 && value <= 100) {
					setProgress(value)
				}
			})
		)
		unlisteners.push(
			listen<transcript.Segment>('new_segment', (event) => {
				const { payload } = event
				setSegments((prev) => (prev ? [...prev, payload] : [payload]))
			})
		)
		unlisteners.push(
			listen<{ path: string; name: string }>('record_finish', (event) => {
				if (hotkeyRecordingActive) return
				const { name, path } = event.payload
				setSelectedFolder(null)
				preference.setHomeTab("file")
				setFiles([{ name, path }])
				setIsRecording(false)
				transcribe(path)
			})
		)
		unlisteners.push(
			listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
				setSelectedFolder(null)
				const newFiles: NamedPath[] = []
				for (const path of event.payload.paths) {
					const file = await pathToNamedPath(path)
					newFiles.push({ name: file.name, path: file.path })
				}
				setFiles(newFiles)
				if (newFiles.length > 1) {
					navigate('/batch', { state: { files: newFiles.map((f) => f.path) } })
				}
			})
		)

		return () => {
			unlisteners.forEach((p) => p.then((fn) => fn()))
		}
	}

	function setInputDeviceAndSave(value: SetStateAction<AudioDevice | null>) {
		const device = typeof value === 'function' ? value(inputDevice) : value
		setSavedInputDeviceId(device?.id ?? '')
		setInputDevice(device)
	}

	function setOutputDeviceAndSave(value: SetStateAction<AudioDevice | null>) {
		const device = typeof value === 'function' ? value(outputDevice) : value
		setSavedOutputDeviceId(device?.id ?? '')
		setOutputDevice(device)
	}

	async function loadAudioDevices() {
		let newDevices = await invoke<AudioDevice[]>('get_audio_devices')
		const inputs = newDevices.filter((d) => d.isInput)
		const outputs = newDevices.filter((d) => !d.isInput)
		// null = no saved preference → use system default; '' = user explicitly chose none
		const restoredInput = savedInputDeviceId === null
			? inputs.find((d) => d.isDefault) ?? null
			: inputs.find((d) => d.id === savedInputDeviceId) ?? null
		const restoredOutput = savedOutputDeviceId === null
			? outputs.find((d) => d.isDefault) ?? null
			: outputs.find((d) => d.id === savedOutputDeviceId) ?? null
		setInputDevice(restoredInput)
		setOutputDevice(restoredOutput)
		setDevices(newDevices)
	}

	async function onAbort() {
		setIsAborting(true)
		abortRef.current = true
		event.emit('abort_transcribe')
	}

	async function selectFiles() {
		const selected = await dialog.open({
			multiple: true,
			filters: [
				{
					name: 'Audio or Video files',
					extensions: [...config.audioExtensions, ...config.videoExtensions],
				},
			],
		})
		if (selected) {
			setSelectedFolder(null)
			const newFiles: NamedPath[] = []
			for (const path of selected) {
				const name = await basename(path)
				newFiles.push({ path, name })
			}
			setFiles(newFiles)

			if (newFiles.length > 1) {
				navigate('/batch', { state: { files: newFiles.map((f) => f.path) } })
			}
		}
	}

	async function loadFolderFiles(folder: string, recursive: boolean) {
		setIsCollectingFolder(true)
		try {
			const paths = await invoke<string[]>('glob_files', {
				folder,
				patterns: [...config.audioExtensions, ...config.videoExtensions],
				recursive,
			})
			const newFiles: NamedPath[] = []
			for (const filePath of paths) {
				const name = await basename(filePath)
				newFiles.push({ path: filePath, name })
			}
			setFiles(newFiles)
		} finally {
			setIsCollectingFolder(false)
		}
	}

	async function selectFolder() {
		const folder = await dialog.open({ multiple: false, directory: true })
		if (!folder || Array.isArray(folder)) return
		setSelectedFolder(folder)
		await loadFolderFiles(folder, preference.advancedTranscribeOptions.includeSubFolders)
	}

	function startFolderBatch() {
		if (!selectedFolder || !files.length) return
		navigate('/batch', {
			state: {
				files: files.map((file) => file.path),
				outputFolder: selectedFolder,
			},
		})
	}

	function clearFolderSelection() {
		setSelectedFolder(null)
		setFiles([])
		setAudio(null)
	}

	useEffect(() => {
		if (!selectedFolder) return
		loadFolderFiles(selectedFolder, preference.advancedTranscribeOptions.includeSubFolders)
	}, [selectedFolder, preference.advancedTranscribeOptions.includeSubFolders])

	async function checkModelExists() {
		try {
			const configPath = await invoke<string>('get_models_folder')
			const entries = await ls(configPath)
			const filtered = entries.filter((e) => e.name?.endsWith('.bin'))
			if (filtered.length === 0) {
				// Download new model if no models and it's not manual installation
				if (!preference.skippedSetup) {
					navigate('/setup')
				}
			} else {
				if (!preference.modelPath || !(await fs.exists(preference.modelPath))) {
					// if model path not found set another one as default
					const absPath = await path.join(configPath, filtered[0].name)
					preference.setModelPath(absPath)
				}
			}
		} catch (e) {
			console.error(e)
			navigate('/setup')
		}
	}

	useEffect(() => {
		let cleanup: (() => void) | undefined

		async function CheckCpuAndInit() {
			cleanup = setupEventListeners()
			checkModelExists()
		}

		CheckCpuAndInit()

		return () => {
			cleanup?.()
		}
	}, [])

	useEffect(() => {
		if (preference.homeTab === "record") {
			loadAudioDevices()
		}
	}, [preference.homeTab])

	async function startRecord() {
		if (outputDevice) {
			const permitted = await ensureSystemAudioPermission()
			if (!permitted) {
				return
			}
		}

		startKeepAwake()
		setSegments(null)
		setSummarizeSegments(null)
		setTranscriptTab('transcript')

		setIsRecording(true)
		let devices: AudioDevice[] = []
		if (inputDevice) {
			devices.push(inputDevice)
		}
		if (outputDevice) {
			devices.push(outputDevice)
		}
		try {
			await invoke('start_record', { devices, storeInDocuments: preference.storeRecordInDocuments, customPath: preference.customRecordingPath })
		} catch (error) {
			stopKeepAwake()
			setIsRecording(false)
			console.error('startRecord error: ', error)
			setErrorModal?.({ log: String(error), open: true })
		}
	}

	async function stopRecord() {
		try {
			await emit('stop_record')
		} catch (error) {
			stopKeepAwake()
			setIsRecording(false)
			console.error('stopRecord error: ', error)
			setErrorModal?.({ log: String(error), open: true })
		}
	}

	async function transcribe(path: string) {
		const avx2 = await invoke<boolean>('is_avx2_enabled')
		if (!avx2) {
			trackAnalyticsEvent(analyticsEvents.AVX2_NOT_SUPPORTED)
			await dialog.message(t('common.avx2-not-supported'), { kind: 'error' })
			return
		}

		startKeepAwake()

		setSegments(null)
		setSummarizeSegments(null)
		setTranscriptTab('transcript')

		setLoading(true)
		abortRef.current = false

		var newSegments: transcript.Segment[] = []
		trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_STARTED, {
			source: 'home',
		})
		try {
			const modelPath = preferenceRef.current.modelPath
			if (!modelPath) {
				throw new Error('No model selected. Please download or select a model first.')
			}
			const loadResult = await invoke<string>('load_model', { modelPath, gpuDevice: preferenceRef.current.gpuDevice })
			if (loadResult === 'gpu_fallback') {
				hotToast.warning(t('common.gpu-fallback-to-cpu'), { position: 'bottom-center', duration: 8000 })
			}
			let diarize_model: string | undefined
			if (preferenceRef.current.diarizeEnabled) {
				const modelsFolder = await invoke<string>('get_models_folder')
				diarize_model = modelsFolder + '/' + config.diarizeModelFilename
			}
			let vad_model: string | undefined
			if (preferenceRef.current.stableTimestampsEnabled) {
				const modelsFolder = await invoke<string>('get_models_folder')
				vad_model = modelsFolder + '/' + config.vadModelFilename
			}
			const options = {
				path,
				...preferenceRef.current.modelOptions,
				...(diarize_model ? { diarize_model } : {}),
				...(vad_model ? { vad_model } : {}),
				...(preferenceRef.current.stableTimestampsEnabled ? { stable_timestamps: true } : {}),
			}
			const startTime = performance.now()
			const res: transcript.Transcript = await invoke('transcribe', {
				options,
			})

			// Calcualte time
			const total = Math.round((performance.now() - startTime) / 1000)
			console.info(`Transcribe took ${total} seconds.`)

			newSegments = res.segments
			setSegments(res.segments)
			hotToast.success(t('common.transcribe-took', { total: String(total) }), { position: 'bottom-center' })
			trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_SUCCEEDED, {
				source: 'home',
				duration_seconds: total,
				segments_count: res.segments.length,
			})
		} catch (error) {
			if (!abortRef.current) {
				stopKeepAwake()
				console.error('error: ', error)

				// Check if this is a structured error with code
				const errorObj = typeof error === 'object' && error !== null ? (error as any) : null
				const errorCode = errorObj?.code
				const errorMessage = errorObj?.message || String(error)

				if (errorCode && isUserError(errorCode)) {
					// User error: show toast, skip analytics and error modal
					hotToast.error(`${t('common.error')}: ${errorMessage}`, { position: 'bottom-center' })
				} else {
					// Internal error: show modal and track analytics
					trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_FAILED, {
						source: 'home',
						error_message: errorMessage,
						file_ext: path.split('.').pop() ?? 'unknown',
					})
					setErrorModal?.({ log: errorMessage, open: true })
				}
				setLoading(false)
			}
		} finally {
			stopKeepAwake()
			setLoading(false)
			setIsAborting(false)
			setProgress(null)
			if (!abortRef.current) {
				// Focus back the window and play sound
				if (preferenceRef.current.soundOnFinish) {
					new Audio(successSound).play()
				}
				if (preferenceRef.current.focusOnFinish) {
					webview.getCurrentWebviewWindow().unminimize()
					webview.getCurrentWebviewWindow().setFocus()
				}
			}
		}

		if (newSegments && llm && preferenceRef.current.llmConfig?.enabled) {
			const toastId = hotToast.loading(t('common.summarize-loading'))
			try {
				const answer = await summarizeWithChunking(llm, newSegments, preferenceRef.current.llmConfig, t('common.speaker-prefix'), (p) => {
					hotToast.loading(summarizeProgressMessage(p, t), { id: toastId })
				})
				hotToast.success(t('common.summarize-success'), { id: toastId })
				if (answer) {
					setSummarizeSegments([{ start: 0, stop: newSegments?.[newSegments?.length - 1].stop ?? 0, text: answer }])
				}
			} catch (e) {
				hotToast.error(String(e), { id: toastId })
				console.error(e)
			}
		}
	}

	const [summarizing, setSummarizing] = useState(false)

	async function resummarize(prompt: string) {
		if (!segments || !llm) return
		setSummarizing(true)
		const toastId = hotToast.loading(t('common.summarize-loading'))
		try {
			const llmConfig = preferenceRef.current.llmConfig
			const answer = await summarizeWithChunking(llm, segments, { ...llmConfig, prompt }, t('common.speaker-prefix'), (p) => {
				hotToast.loading(summarizeProgressMessage(p, t), { id: toastId })
			})
			hotToast.success(t('common.summarize-success'), { id: toastId })
			if (answer) {
				setSummarizeSegments([{ start: 0, stop: segments[segments.length - 1]?.stop ?? 0, text: answer }])
				setTranscriptTab('summary')
			}
		} catch (e) {
			hotToast.error(String(e), { id: toastId })
			console.error(e)
		} finally {
			setSummarizing(false)
		}
	}

	async function downloadAudio() {
		if (audioUrl) {
			setYtDlpProgress(0)
			setDownloadingAudio(true)
			try {
				const outPath = await ytDlp.downloadAudio(audioUrl, preference.storeRecordInDocuments, preference.customRecordingPath)
				if (cancelYtDlpRef.current) {
					cancelYtDlpRef.current = false
					return
				}
				preference.setHomeTab("file")
				setFiles([{ name: 'audio.m4a', path: outPath }])
				transcribe(outPath)
			} catch (e) {
				console.error(e)
				setErrorModal?.({ log: String(e), open: true })
			} finally {
				setDownloadingAudio(false)
			}
			setYtDlpProgress(null)
		}
	}

	return {
		cancelYtDlpRef,
		cancelYtDlpDownload,
		ytdlpProgress,
		setYtDlpProgress,
		transcriptTab,
		setTranscriptTab,
		summarizeSegments,
		setSummarizeSegments,
		devices,
		setDevices,
		inputDevice,
		setInputDevice: setInputDeviceAndSave,
		outputDevice,
		setOutputDevice: setOutputDeviceAndSave,
		isRecording,
		setIsRecording,
		startRecord,
		stopRecord,
		preference: preference,
		openPath,
		selectFiles,
		selectFolder,
		startFolderBatch,
		clearFolderSelection,
		selectedFolder,
		isCollectingFolder,
		isAborting,
		settingsVisible,
		setSettingsVisible,
		loading,
		progress,
		audio,
		setAudio,
		files,
		setFiles,
		availableUpdate,
		updateApp,
		segments,
		setSegments,
		transcribe,
		onAbort,
		switchToLinkTab,
		audioUrl,
		setAudioUrl,
		downloadAudio,
		downloadingAudio,
		setDownloadingAudio,
		resummarize,
		summarizing,
	}
}
