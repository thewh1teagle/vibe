import '@fontsource/roboto'
import { event, path } from '@tauri-apps/api'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { basename } from '@tauri-apps/api/path'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-shell'
import { useContext, useEffect, useRef, useState } from 'react'
import { toast as hotToast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocalStorage } from 'usehooks-ts'
import successSound from '~/assets/success.mp3'
import { TextFormat } from '~/components/FormatSelect'
import { AudioDevice } from '~/lib/audio'
import { analyticsEvents, trackAnalyticsEvent } from '~/lib/analytics'
import * as config from '~/lib/config'
import { Claude, Llm, Ollama, OpenAICompatible } from '~/lib/llm'
import * as transcript from '~/lib/transcript'
import { useConfirmExit } from '~/lib/useConfirmExit'
import { NamedPath, ls, openPath, pathToNamedPath, startKeepAwake, stopKeepAwake } from '~/lib/utils'
import { getX86Features } from '~/lib/x86Features'
import * as ytDlp from '~/lib/ytdlp'
import { ErrorModalContext } from '~/providers/ErrorModal'
import { useFilesContext } from '~/providers/FilesProvider'
import { ModelOptions, usePreferenceProvider } from '~/providers/Preference'
import { useToastProvider } from '~/providers/Toast'
import { UpdaterContext } from '~/providers/Updater'
import { hotkeyRecordingActive } from '~/providers/Hotkey'

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
	const [inputDevice, setInputDevice] = useState<AudioDevice | null>(null)
	const [outputDevice, setOutputDevice] = useState<AudioDevice | null>(null)
	const [audioUrl, setAudioUrl] = useState<string>('')
	const [downloadingAudio, setDownloadingAudio] = useState(false)
	const [ytdlpProgress, setYtDlpProgress] = useState<number | null>(null)
	const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
	const [isCollectingFolder, setIsCollectingFolder] = useState(false)
	const cancelYtDlpRef = useRef<boolean>(false)
	const switchingToLinkRef = useRef(false)
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

			try {
				latestVersion = await ytDlp.getLatestVersion()
			} catch (e) {
				console.error('Failed to fetch latest yt-dlp version', e)
				if (binaryExists) {
					preference.setHomeTabIndex(2)
					return
				}
			}

			const needsInstall = !binaryExists
			const needsUpdate = !needsInstall && preference.shouldCheckYtDlpVersion && latestVersion !== null && latestVersion !== preference.ytDlpVersion

			if (needsUpdate && skippedYtDlpUpdatePromptRef.current) {
				preference.setHomeTabIndex(2)
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
						preference.setHomeTabIndex(2)
					} catch (e) {
						console.error(e)
						setErrorModal?.({ log: String(e), open: true })
					}
				} else if (binaryExists) {
					if (needsUpdate) {
						skippedYtDlpUpdatePromptRef.current = true
					}
					preference.setHomeTabIndex(2)
				}
			} else {
				preference.setHomeTabIndex(2)
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
				preference.setHomeTabIndex(1)
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
					navigate('/batch', { state: { files: newFiles } })
				}
			})
		)

		return () => {
			unlisteners.forEach((p) => p.then((fn) => fn()))
		}
	}

	async function loadAudioDevices() {
		let newDevices = await invoke<AudioDevice[]>('get_audio_devices')
		const defaultInput = newDevices.find((d) => d.isDefault && d.isInput)
		const defaultOutput = newDevices.find((d) => d.isDefault && !d.isInput)
		if (defaultInput) {
			setInputDevice(defaultInput)
		}
		if (defaultOutput) {
			setOutputDevice(defaultOutput)
		}
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
				navigate('/batch', { state: { files: newFiles } })
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
			const features = await getX86Features()
			if (features) {
				const unsupported = Object.entries(features || {})
					.filter(([_, feature]) => feature.enabled && !feature.support)
					.map(([name]) => name)
				if (unsupported.length > 0) {
					// Found unsupported features
					await dialog.message(
						`Your CPU is old and doesn't support some features (${unsupported.join(
							',',
						)}). Please click OK and read the readme that will open for more information.`,
						{
							kind: 'error',
						},
					)
					open(config.unsupportedCpuReadmeURL)
					return // Don't run anything
				}
			}

			cleanup = setupEventListeners()
			checkModelExists()
			loadAudioDevices()
		}

		CheckCpuAndInit()

		return () => {
			cleanup?.()
		}
	}, [])

	async function startRecord() {
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
			await invoke('start_record', { devices, storeInDocuments: preference.storeRecordInDocuments })
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
			const options = {
				path,
				...preferenceRef.current.modelOptions,
				...(diarize_model ? { diarize_model } : {}),
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
				trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_FAILED, {
					source: 'home',
					error_message: String(error),
					file_ext: path.split('.').pop() ?? 'unknown',
				})
				setErrorModal?.({ log: String(error), open: true })
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
			try {
				const question = `${preferenceRef.current.llmConfig.prompt.replace('%s', transcript.asText(newSegments, t('common.speaker-prefix')))}`
				const answerPromise = llm.ask(question)
				hotToast.promise(answerPromise, {
					loading: t('common.summarize-loading'),
					error: (error) => {
						return String(error)
					},
					success: t('common.summarize-success'),
				})
				const answer = await answerPromise
				if (answer) {
					setSummarizeSegments([{ start: 0, stop: newSegments?.[newSegments?.length - 1].stop ?? 0, text: answer }])
				}
			} catch (e) {
				console.error(e)
			}
		}
	}

	const [summarizing, setSummarizing] = useState(false)

	async function resummarize(prompt: string) {
		if (!segments || !llm) return
		setSummarizing(true)
		try {
			const question = prompt.replace('%s', transcript.asText(segments, t('common.speaker-prefix')))
			const answerPromise = llm.ask(question)
			hotToast.promise(answerPromise, {
				loading: t('common.summarize-loading'),
				error: (error) => String(error),
				success: t('common.summarize-success'),
			})
			const answer = await answerPromise
			if (answer) {
				setSummarizeSegments([{ start: 0, stop: segments[segments.length - 1]?.stop ?? 0, text: answer }])
				setTranscriptTab('summary')
			}
		} catch (e) {
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
				const outPath = await ytDlp.downloadAudio(audioUrl, preference.storeRecordInDocuments)
				if (cancelYtDlpRef.current) {
					cancelYtDlpRef.current = false
					return
				}
				preference.setHomeTabIndex(1)
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
		setInputDevice,
		outputDevice,
		setOutputDevice,
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
