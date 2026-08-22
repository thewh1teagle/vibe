import { invoke } from '@tauri-apps/api/core'
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import successSound from '~/assets/success.mp3'
import { m } from '~/paraglide/messages.js'
import { analyticsEvents, trackAnalyticsEvent } from '~/lib/analytics'
import * as config from '~/lib/config'
import { KEEP_AWAKE, startKeepAwake, stopKeepAwake } from '~/lib/keep-awake'
import { validPath } from '~/lib/media'
import { isUserError } from '~/lib/sona-errors'
import type { Segment, Transcript } from '~/lib/transcript'
import { notifyTranscriptsChanged, saveTranscript, updateTranscriptSegments, updateTranscriptSummary, type TranscriptRecord } from '~/lib/transcripts-store'
import type { NamedPath } from '~/lib/types'
import { ErrorModalContext } from '~/providers/error-modal'
import { type Preference, usePreferenceProvider } from '~/providers/preference'

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'

export interface Job {
	id: string
	name: string
	path: string
	status: JobStatus
	/** 0..100, only meaningful while running */
	progress: number
	segments: Segment[]
	error?: string
	/** wall clock seconds the transcription took */
	seconds?: number
	/** path of the .vibe.json this job was saved to / loaded from, when persisted */
	savedPath?: string
	/** true when the job was loaded from the store rather than transcribed in this session */
	hydrated?: boolean
	/** Last AI summary of this transcript, when one was made. */
	summary?: string
}

export interface TranscribeQueue {
	jobs: Job[]
	activeId: string | null
	selectedId: string | null
	selectedJob: Job | null
	running: boolean
	isAborting: boolean
	hasResults: boolean
	selectJob: (id: string) => void
	enqueue: (files: NamedPath[]) => void
	/**
	 * Replace the session with a transcript loaded from the store, shown as a finished job.
	 * `audioPath` is the media copy kept in the project folder, when it still has one; it becomes the
	 * job's path so the player keeps working after the original file moved away.
	 */
	hydrate: (record: TranscriptRecord, savedPath: string, audioPath?: string | null) => void
	/** Inline edit of one segment's text. Persists to the job's saved file when it has one. */
	updateSegmentText: (jobId: string, segmentIndex: number, text: string) => void
	/** Attach an AI summary to a job. Persists to the job's saved file when it has one. */
	setJobSummary: (jobId: string, summary: string) => void
	cancelCurrent: () => void
	cancelAll: () => void
	reset: () => void
}

let jobCounter = 0
function nextJobId() {
	jobCounter += 1
	return `job-${jobCounter}`
}

/** Options shared by every file of a run (diarize / vad model paths). */
async function buildSharedOptions(preference: Preference) {
	const requiresVad = preference.modelMetadata?.capabilities.requires_vad ?? false
	const needsFolder = preference.diarizeEnabled || preference.stableTimestampsEnabled || requiresVad
	const modelsFolder = needsFolder ? await invoke<string>('get_models_folder') : null
	return {
		...(preference.diarizeEnabled ? { diarize_model: `${modelsFolder}/${config.diarizeModelFilename}` } : {}),
		...(preference.stableTimestampsEnabled || requiresVad ? { vad_model: `${modelsFolder}/${config.vadModelFilename}` } : {}),
		...(preference.stableTimestampsEnabled ? { stable_timestamps: true } : {}),
	}
}

function errorParts(error: unknown) {
	const object = typeof error === 'object' && error !== null ? (error as { code?: string; message?: string }) : null
	return { code: object?.code, message: object?.message || String(error) }
}

/**
 * One sequential transcription queue: the model is loaded once, then every queued file runs
 * in order. Segments of the currently running file stream in live through `new_segment`.
 */
export function useTranscribeQueue(): TranscribeQueue {
	const preference = usePreferenceProvider()
	const preferenceRef = useRef(preference)
	const { setState: setErrorModal } = useContext(ErrorModalContext)

	const [jobs, setJobs] = useState<Job[]>([])
	const jobsRef = useRef<Job[]>([])
	const [activeId, setActiveId] = useState<string | null>(null)
	const activeIdRef = useRef<string | null>(null)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const selectedIdRef = useRef<string | null>(null)
	const pinnedRef = useRef(false)
	const [running, setRunning] = useState(false)
	const runningRef = useRef(false)
	const [isAborting, setIsAborting] = useState(false)
	const abortCurrentRef = useRef(false)
	const abortAllRef = useRef(false)

	useEffect(() => {
		preferenceRef.current = preference
	}, [preference])

	const commit = useCallback((next: Job[]) => {
		jobsRef.current = next
		setJobs(next)
	}, [])

	const patch = useCallback(
		(id: string, changes: Partial<Job>) => {
			commit(jobsRef.current.map((job) => (job.id === id ? { ...job, ...changes } : job)))
		},
		[commit],
	)

	const select = useCallback((id: string | null) => {
		selectedIdRef.current = id
		setSelectedId(id)
	}, [])

	const selectJob = useCallback(
		(id: string) => {
			pinnedRef.current = true
			select(id)
		},
		[select],
	)

	useEffect(() => {
		const unlisteners: Promise<UnlistenFn>[] = []

		unlisteners.push(
			listen<number>('transcribe_progress', ({ payload }) => {
				const id = activeIdRef.current
				if (id && payload >= 0 && payload <= 100) patch(id, { progress: payload })
			}),
		)
		unlisteners.push(
			listen<Segment>('new_segment', ({ payload }) => {
				const id = activeIdRef.current
				if (!id) return
				commit(jobsRef.current.map((job) => (job.id === id ? { ...job, segments: [...job.segments, payload] } : job)))
			}),
		)

		return () => {
			unlisteners.forEach((promise) => promise.then((unlisten) => unlisten()))
		}
	}, [commit, patch])

	const failPending = useCallback(
		(message: string) => {
			commit(jobsRef.current.map((job) => (job.status === 'queued' || job.status === 'running' ? { ...job, status: 'error', error: message } : job)))
		},
		[commit],
	)

	/**
	 * Auto-save a finished job into the transcripts store. Fire-and-forget on purpose: persistence
	 * must never delay or break the queue, so failures only surface in the console.
	 */
	const persist = useCallback(
		(job: Job, segments: Segment[]) => {
			const current = preferenceRef.current
			if (!current.saveTranscripts || segments.length === 0) return
			void saveTranscript({
				name: job.name,
				sourcePath: job.path,
				segments,
				language: current.modelOptions.lang,
				modelPath: current.modelPath,
			}).then((savedPath) => {
				if (!savedPath) return
				patch(job.id, { savedPath })
				notifyTranscriptsChanged()
			})
		},
		[patch],
	)

	const runLoop = useCallback(async () => {
		if (runningRef.current) return
		runningRef.current = true
		setRunning(true)
		abortAllRef.current = false
		setIsAborting(false)
		startKeepAwake(KEEP_AWAKE.queue)
		let completedAny = false

		try {
			const avx2 = await invoke<boolean>('is_avx2_enabled')
			if (!avx2) {
				trackAnalyticsEvent(analyticsEvents.AVX2_NOT_SUPPORTED)
				await dialog.message(m.avx2NotSupported(), { kind: 'error' })
				failPending(m.avx2NotSupported())
				return
			}

			const current = preferenceRef.current
			if (!current.modelPath) {
				failPending(m.noModelSelected())
				toast.error(m.noModelSelected(), { position: 'bottom-center' })
				return
			}

			let shared: Record<string, unknown>
			try {
				const loadResult = await invoke<string>('load_model', {
					modelPath: current.modelPath,
					gpuDevice: current.gpuDevice,
					unloadTimeoutMinutes: current.unloadTimeoutMinutes,
				})
				if (loadResult === 'gpu_fallback') toast.warning(m.gpuFallbackToCpu(), { position: 'bottom-center', duration: 8000 })
				shared = await buildSharedOptions(current)
			} catch (error) {
				const { message } = errorParts(error)
				failPending(message)
				setErrorModal?.({ log: message, open: true })
				return
			}

			while (!abortAllRef.current) {
				const next = jobsRef.current.find((job) => job.status === 'queued')
				if (!next) break

				activeIdRef.current = next.id
				setActiveId(next.id)
				if (!pinnedRef.current) select(next.id)
				patch(next.id, { status: 'running', progress: 0, segments: [], error: undefined })
				abortCurrentRef.current = false

				const startedAt = performance.now()
				trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_STARTED, { source: 'main' })
				try {
					const result = await invoke<Transcript>('transcribe', {
						options: { path: next.path, ...preferenceRef.current.modelOptions, ...shared },
					})
					const seconds = Math.round((performance.now() - startedAt) / 1000)
					patch(next.id, { status: 'done', progress: 100, segments: result.segments, seconds })
					completedAny = true
					persist(next, result.segments)
					trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_SUCCEEDED, {
						source: 'main',
						duration_seconds: seconds,
						segments_count: result.segments.length,
					})
				} catch (error) {
					if (abortCurrentRef.current || abortAllRef.current) {
						patch(next.id, { status: 'cancelled', progress: 0 })
					} else {
						const { code, message } = errorParts(error)
						patch(next.id, { status: 'error', progress: 0, error: message })
						if (code && isUserError(code)) {
							toast.error(`${m.error()}: ${message}`, { position: 'bottom-center' })
						} else {
							trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_FAILED, {
								source: 'main',
								error_message: message,
								file_ext: next.path.split('.').pop() ?? 'unknown',
							})
							setErrorModal?.({ log: message, open: true })
							// Every following file would fail the same way.
							if (message.includes('no model loaded')) {
								toast.error(m.noModelLoadedBatchStopped(), { position: 'bottom-center' })
								failPending(message)
								break
							}
						}
					}
				} finally {
					abortCurrentRef.current = false
					setIsAborting(false)
				}
			}

			if (abortAllRef.current) {
				commit(jobsRef.current.map((job) => (job.status === 'queued' ? { ...job, status: 'cancelled' } : job)))
			}
		} finally {
			stopKeepAwake(KEEP_AWAKE.queue)
			activeIdRef.current = null
			setActiveId(null)
			runningRef.current = false
			setRunning(false)
			setIsAborting(false)

			if (completedAny) {
				const finished = preferenceRef.current
				if (finished.soundOnFinish) new Audio(successSound).play()
				if (finished.focusOnFinish) {
					webview.getCurrentWebviewWindow().unminimize()
					webview.getCurrentWebviewWindow().setFocus()
				}
			}

			// A file enqueued while the loop was winding down would otherwise stay queued forever.
			if (!abortAllRef.current && jobsRef.current.some((job) => job.status === 'queued')) void runLoop()
		}
	}, [commit, failPending, patch, persist, select, setErrorModal])

	const enqueue = useCallback(
		(files: NamedPath[]) => {
			const accepted = files.filter((file) => validPath(file.path.toLowerCase()))
			if (accepted.length === 0) {
				if (files.length > 0) toast.error(m.supportsFormats(), { position: 'bottom-center' })
				return
			}

			const created: Job[] = accepted.map((file) => ({
				id: nextJobId(),
				name: file.name,
				path: file.path,
				status: 'queued',
				progress: 0,
				segments: [],
			}))
			commit([...jobsRef.current, ...created])
			if (!selectedIdRef.current) select(created[0].id)
			void runLoop()
		},
		[commit, runLoop, select],
	)

	/** Load a saved transcript as the whole session: one finished job the done view can render. */
	const hydrate = useCallback(
		(record: TranscriptRecord, savedPath: string, audioPath?: string | null) => {
			if (runningRef.current) return
			const job: Job = {
				id: nextJobId(),
				name: record.name,
				// The project folder's own copy of the media, else the original path it came from.
				path: audioPath || record.sourcePath,
				status: 'done',
				progress: 100,
				segments: record.segments,
				savedPath,
				hydrated: true,
				summary: record.summary,
			}
			pinnedRef.current = true
			commit([job])
			select(job.id)
		},
		[commit, select],
	)

	/**
	 * Replace the text of one segment. The write back to the store is fire-and-forget for the same
	 * reason `persist` is: an unwritable file must not cost the user their edit on screen.
	 */
	const updateSegmentText = useCallback(
		(jobId: string, segmentIndex: number, text: string) => {
			const job = jobsRef.current.find((candidate) => candidate.id === jobId)
			const segment = job?.segments[segmentIndex]
			if (!job || !segment || segment.text === text) return
			const segments = job.segments.map((item, index) => (index === segmentIndex ? { ...item, text } : item))
			commit(jobsRef.current.map((candidate) => (candidate.id === jobId ? { ...candidate, segments } : candidate)))
			if (job.savedPath) void updateTranscriptSegments(job.savedPath, segments)
		},
		[commit],
	)

	/** Same fire-and-forget write-back as the segment edits: the screen must not wait on the disk. */
	const setJobSummary = useCallback(
		(jobId: string, summary: string) => {
			const job = jobsRef.current.find((candidate) => candidate.id === jobId)
			if (!job || job.summary === summary) return
			commit(jobsRef.current.map((candidate) => (candidate.id === jobId ? { ...candidate, summary } : candidate)))
			if (job.savedPath) void updateTranscriptSummary(job.savedPath, summary)
		},
		[commit],
	)

	const cancelCurrent = useCallback(() => {
		if (!activeIdRef.current) return
		abortCurrentRef.current = true
		setIsAborting(true)
		emit('abort_transcribe')
	}, [])

	const cancelAll = useCallback(() => {
		abortAllRef.current = true
		abortCurrentRef.current = true
		setIsAborting(true)
		emit('abort_transcribe')
		commit(jobsRef.current.map((job) => (job.status === 'queued' ? { ...job, status: 'cancelled' } : job)))
	}, [commit])

	const reset = useCallback(() => {
		if (runningRef.current) cancelAll()
		pinnedRef.current = false
		commit([])
		select(null)
	}, [cancelAll, commit, select])

	const selectedJob = jobs.find((job) => job.id === selectedId) ?? null
	const hasResults = jobs.some((job) => job.segments.length > 0)

	return {
		jobs,
		activeId,
		selectedId,
		selectedJob,
		running,
		isAborting,
		hasResults,
		selectJob,
		enqueue,
		hydrate,
		updateSegmentText,
		setJobSummary,
		cancelCurrent,
		cancelAll,
		reset,
	}
}
