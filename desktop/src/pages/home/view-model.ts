import '@fontsource/roboto/400.css'
import { path } from '@tauri-apps/api'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { TextFormat } from '~/components/format-select'
import * as transcript from '~/lib/transcript'
import { useConfirmExit } from '~/lib/use-confirm-exit'
import { NamedPath } from '~/lib/types'
import { ls, pathToNamedPath } from '~/lib/fs'
import { openPath } from '~/lib/app'
import { ModelOptions, usePreferenceProvider } from '~/providers/preference'
import { UpdaterContext } from '~/providers/updater'
import { hotkeyRecordingActive } from '~/providers/hotkey'
import { useSummarization } from './hooks/use-summarization'
import { useRecording } from './hooks/use-recording'
import { useAudioDownload } from './hooks/use-audio-download'
import { useMediaSelection } from './hooks/use-media-selection'
import { useTranscription } from './hooks/use-transcription'

export interface BatchOptions {
	files: NamedPath[]
	format: TextFormat
	modelOptions: ModelOptions
}

export function viewModel() {
	const location = useLocation()
	const [settingsVisible, setSettingsVisible] = useState(location.hash === '#settings')
	const navigate = useNavigate()
	const { t } = useTranslation()
	const {
		segments: summarizeSegments,
		setSegments: setSummarizeSegments,
		summarizing,
		transcriptTab,
		setTranscriptTab,
		summarize,
	} = useSummarization()
	const { loading, isAborting, segments, setSegments, progress, setProgress, transcribe, onAbort } = useTranscription({
		onResetSummary: () => {
			setSummarizeSegments(null)
			setTranscriptTab('transcript')
		},
		onSummarize: summarize,
	})
	const {
		devices,
		setDevices,
		inputDevice,
		setInputDevice,
		outputDevice,
		setOutputDevice,
		isRecording,
		setIsRecording,
		recordingName,
		setRecordingName,
		startRecord,
		stopRecord,
	} = useRecording(() => {
		setSegments(null)
		setSummarizeSegments(null)
		setTranscriptTab('transcript')
	})
	useConfirmExit((segments?.length ?? 0) > 0 || loading)

	const {
		files, setFiles, audio, setAudio, selectedFolder, setSelectedFolder, isCollectingFolder,
		selectFiles, selectFolder, startFolderBatch, clearFolderSelection,
	} = useMediaSelection()
	const preference = usePreferenceProvider()
	const {
		cancelYtDlpRef, cancelYtDlpDownload, ytdlpProgress, setYtDlpProgress, switchToLinkTab,
		audioUrl, setAudioUrl, downloadAudio, downloadingAudio, setDownloadingAudio,
	} = useAudioDownload(transcribe)

	const { updateApp, availableUpdate } = useContext(UpdaterContext)


	async function checkIfCrashedRecently() {
		const isCrashed = await invoke<boolean>('is_crashed_recently')
		if (isCrashed) {
			dialog.message(t('common.crashed-recently'))
			await invoke('rename_crash_file')
		}
	}


	useEffect(() => {
		checkIfCrashedRecently()
	}, [])



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



	async function resummarize(prompt: string) {
		if (segments) await summarize(segments, prompt, true)
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
		recordingName,
		setRecordingName,
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
