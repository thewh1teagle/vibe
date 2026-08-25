import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { webviewWindow } from '@tauri-apps/api'
import * as dialog from '@tauri-apps/plugin-dialog'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import * as config from '~/lib/config'
import { pathToNamedPath } from '~/lib/fs'
import { cleanupPartialDownloads, listInstalledModels, type InstalledModel } from '~/lib/model'
import type { NamedPath, ProjectSource } from '~/lib/types'
import { useConfirmExit } from '~/lib/use-confirm-exit'
import { hotkeyRecordingActive } from '~/providers/hotkey'
import { usePreferenceProvider, type Preference } from '~/providers/preference'
import { useAudioDownload } from '~/pages/home/hooks/use-audio-download'
import { useRecording } from '~/pages/home/hooks/use-recording'
import { useDropTarget } from './hooks/use-drop-target'
import { useSummaries, type Summaries } from './hooks/use-summaries'
import { useTranscribeQueue, type TranscribeQueue } from './hooks/use-transcribe-queue'

export type SessionMode = 'idle' | 'working' | 'done'
export type IdlePanel = 'none' | 'record' | 'link'

type Recording = ReturnType<typeof useRecording>
type AudioDownload = ReturnType<typeof useAudioDownload>

export interface Session {
	mode: SessionMode
	queue: TranscribeQueue
	/** AI summaries of finished transcripts (settings → Summarize). */
	summaries: Summaries
	preference: Preference
	dragging: boolean
	panel: IdlePanel
	setPanel: (panel: IdlePanel) => void
	recording: Recording
	recordElapsed: number
	link: AudioDownload
	collectingFolder: boolean
	browse: () => Promise<void>
	startNew: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useSession() {
	const session = useContext(SessionContext)
	if (!session) throw new Error('useSession must be used inside <SessionProvider>')
	return session
}

const mediaExtensions = [...config.audioExtensions, ...config.videoExtensions]

export function SessionProvider({ children }: { children: ReactNode }) {
	const navigate = useNavigate()
	const preference = usePreferenceProvider()
	const queue = useTranscribeQueue()
	const summaries = useSummaries(queue)
	const [panel, setPanel] = useState<IdlePanel>('none')
	const [collectingFolder, setCollectingFolder] = useState(false)
	const [recordElapsed, setRecordElapsed] = useState(0)

	const enqueueRef = useRef(queue.enqueue)
	useEffect(() => {
		enqueueRef.current = queue.enqueue
	}, [queue.enqueue])

	const enqueuePaths = useCallback(
		async (paths: string[], source: ProjectSource) => {
			const files: NamedPath[] = []
			for (const item of paths) {
				// A picked or dropped path may be a folder — detect and expand to its media files.
				const isMediaFile = mediaExtensions.some((ext) => item.toLowerCase().endsWith(`.${ext.toLowerCase()}`))
				if (isMediaFile) {
					files.push({ ...(await pathToNamedPath(item)), source })
					continue
				}
				setCollectingFolder(true)
				try {
					const expanded = await invoke<string[]>('glob_files', {
						folder: item,
						patterns: mediaExtensions,
						recursive: preference.advancedTranscribeOptions.includeSubFolders,
					})
					for (const path of expanded) files.push({ ...(await pathToNamedPath(path)), source })
				} catch {
					files.push({ ...(await pathToNamedPath(item)), source })
				} finally {
					setCollectingFolder(false)
				}
			}
			if (files.length) enqueueRef.current(files)
		},
		[preference.advancedTranscribeOptions.includeSubFolders],
	)

	const dragging = useDropTarget(
		useCallback(
			(paths: string[]) => {
				setPanel('none')
				void enqueuePaths(paths, 'file')
			},
			[enqueuePaths],
		),
	)

	/** A downloaded file remains explicitly URL-sourced after it lands on disk. */
	const transcribeOne = useCallback(
		async (filePath: string) => {
			await enqueuePaths([filePath], 'url')
		},
		[enqueuePaths],
	)

	const recording = useRecording(() => setPanel('record'))
	const link = useAudioDownload(transcribeOne)

	useEffect(() => {
		if (!recording.isRecording) {
			setRecordElapsed(0)
			return
		}
		setRecordElapsed(0)
		const startedAt = Date.now()
		const timer = window.setInterval(() => setRecordElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500)
		return () => window.clearInterval(timer)
	}, [recording.isRecording])

	// Recording finished in the backend -> the produced file goes straight into the queue.
	useEffect(() => {
		const unlisten: Promise<UnlistenFn> = listen<{ path: string; name: string }>('record_finish', ({ payload }) => {
			if (hotkeyRecordingActive) return
			recording.setIsRecording(false)
			setPanel('none')
			enqueueRef.current([{ name: payload.name, path: payload.path, source: 'record' }])
		})
		return () => {
			unlisten.then((fn) => fn())
		}
	}, [recording.setIsRecording])

	const browse = useCallback(async () => {
		/**
		 * One picker for both: macOS' open panel takes files and folders together, so the native
		 * command handles it there. Everywhere else it returns null and the plugin dialog (files
		 * only) stands in — folders still arrive by drag and drop.
		 */
		let picked: string[] | null = null
		try {
			picked = await invoke<string[] | null>('pick_media_paths', { extensions: mediaExtensions })
		} catch (error) {
			console.warn('native picker unavailable:', error)
		}
		if (!picked) {
			const selected = await dialog.open({ multiple: true, filters: [{ name: 'Audio or Video files', extensions: mediaExtensions }] })
			if (!selected) return
			picked = Array.isArray(selected) ? selected : [selected]
		}
		if (!picked.length) return
		setPanel('none')
		await enqueuePaths(picked, 'file')
	}, [enqueuePaths])

	const startNew = useCallback(() => {
		queue.reset()
		setPanel('none')
	}, [queue])

	// Same guards the old home page ran on mount.
	useEffect(() => {
		async function checkIfCrashedRecently() {
			try {
				if (await invoke<boolean>('is_crashed_recently')) {
					dialog.message(m.crashedRecently())
					await invoke('rename_crash_file')
				}
			} catch (error) {
				console.error(error)
			}
		}

		/** A truncated or corrupt file is not a model, so say so instead of letting sona fail on it. */
		function reportCorruptModels(corrupt: InstalledModel[]) {
			for (const model of corrupt) {
				console.error(`corrupt model file ${model.path}: ${model.reason}`)
				toast.error(m.modelFileCorrupt(), {
					description: m.modelFileCorruptDescription({ name: model.name }),
					action: {
						label: m.reDownload(),
						// Re-downloading writes over the broken file rather than beside it.
						onClick: () => navigate('/setup', { state: { replacePath: model.path } }),
					},
				})
			}
		}

		async function checkModelExists() {
			try {
				const modelsFolder = await invoke<string>('get_models_folder')
				// Partial downloads cannot be resumed, so a leftover `.part` is only wasted space.
				await cleanupPartialDownloads(modelsFolder)
				const installed = await listInstalledModels(modelsFolder)
				const models = installed.filter((model) => model.valid)
				reportCorruptModels(installed.filter((model) => !model.valid))
				if (models.length === 0) {
					preference.setModelPath(null)
					if (!preference.skippedSetup) navigate('/setup')
					return
				}
				if (!preference.modelPath || !models.some((model) => model.path === preference.modelPath)) {
					preference.setModelPath(models[0].path)
				}
			} catch (error) {
				console.error(error)
				navigate('/setup')
			}
		}

		async function showWindow() {
			const currentWindow = webviewWindow.getCurrentWebviewWindow()
			await currentWindow.show()
			if (import.meta.env.PROD) await currentWindow.setFocus()
		}

		void checkIfCrashedRecently()
		void checkModelExists()
		void showWindow()
	}, [])

	// Results persist the moment they exist, so closing only warns when something would
	// actually be lost: a run in flight, or finished results that never reached disk
	// (saving disabled or failed).
	const hasUnsavedResults = queue.jobs.some((job) => job.status === 'done' && !job.hydrated && !job.savedPath)
	useConfirmExit(preference.closeToTray, queue.running || hasUnsavedResults)

	const mode: SessionMode = queue.jobs.length === 0 ? 'idle' : queue.running || queue.jobs.some((job) => job.status === 'queued') ? 'working' : 'done'

	const value = useMemo<Session>(
		() => ({
			mode,
			queue,
			summaries,
			preference,
			dragging,
			panel,
			setPanel,
			recording,
			recordElapsed,
			link,
			collectingFolder,
			browse,
			startNew,
		}),
		[mode, queue, summaries, preference, dragging, panel, recording, recordElapsed, link, collectingFolder, browse, startNew],
	)

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
