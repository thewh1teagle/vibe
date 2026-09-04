import { invoke } from '@tauri-apps/api/core'
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import * as webview from '@tauri-apps/api/webviewWindow'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import successSound from '~/assets/success.mp3'
import { m } from '~/paraglide/messages.js'
import { trackGpuOutOfMemory, trackTranscribeCancelled, trackTranscribeFailed, trackTranscribeStarted, trackTranscribeSucceeded } from '~/lib/analytics'
import * as config from '~/lib/config'
import { KEEP_AWAKE, startKeepAwake, stopKeepAwake } from '~/lib/keep-awake'
import { validPath } from '~/lib/media'
import { autoProjectName } from '~/lib/project-name'
import { gpuOutOfMemoryBefore, rememberGpuOutOfMemory } from '~/lib/gpu-memory'
import { fatalRunError, isGpuOutOfMemory, isUserError, serverErrorCodes } from '~/lib/server-errors'
import type { Segment, SpeakerNames, Transcript } from '~/lib/transcript'
import {
	notifyTranscriptsChanged,
	renameTranscript,
	saveTranscript,
	updateTranscriptSegments,
	updateTranscriptSpeakerNames,
	updateTranscriptSummary,
	type TranscriptRecord,
	type SaveTranscriptResult,
	type TranscriptEntry,
} from '~/lib/transcripts-store'
import type { NamedPath, ProjectSource } from '~/lib/types'
import { ErrorModalContext } from '~/providers/error-modal'
import { withoutUnsupportedOptions } from '~/lib/model'
import { type Preference, usePreferenceProvider } from '~/providers/preference'

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'

/** One transcription input. `projectName` re-runs an existing project under the title it already has. */
export interface EnqueueItem extends NamedPath {
	/** Title of the project this input came from; used verbatim, without a source prefix. */
	projectName?: string
}

export interface Job {
	id: string
	name: string
	path: string
	/** Origin of this newly created project. */
	source?: ProjectSource
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
	/** Names the user gave the diarized speakers, by zero-based speaker index. */
	speakerNames?: SpeakerNames
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
	enqueue: (files: EnqueueItem[]) => void
	/** Transcribe the media already attached to a hydrated project with no transcript. */
	transcribeJob: (jobId: string) => void
	/**
	 * Replace the session with a transcript loaded from the store, shown as a finished job.
	 * `audioPath` is the media copy kept in the project folder, when it still has one; it becomes the
	 * job's path so the player keeps working after the original file moved away.
	 */
	hydrate: (record: TranscriptRecord, savedPath: string, audioPath?: string | null, source?: ProjectSource) => string | null
	/** Inline edit of one segment's text. Persists to the job's saved file when it has one. */
	updateSegmentText: (jobId: string, segmentIndex: number, text: string) => void
	/** Rename the visible project and its persisted record, when one exists. */
	renameJob: (jobId: string, name: string) => Promise<boolean>
	/** Update the visible title while the inline rename editor is open. */
	previewJobName: (jobId: string, name: string) => void
	/** Attach an AI summary to a job. Persists to the job's saved file when it has one. */
	setJobSummary: (jobId: string, summary: string) => void
	/** Name one diarized speaker; an empty name restores "Speaker N". Persists like the segment edits. */
	setSpeakerName: (jobId: string, speaker: number, name: string) => void
	/** Attribute one line to a speaker: a line diarization missed, or one it got wrong. */
	setSegmentSpeaker: (jobId: string, segmentIndex: number, speaker: number) => void
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

/** Reload the current model on the CPU. False when even that failed, so the original error stands. */
async function reloadOnCpu(preference: Preference): Promise<boolean> {
	try {
		await invoke('load_model', {
			modelPath: preference.modelPath,
			gpuDevice: preference.gpuDevice,
			noGpu: true,
			unloadTimeoutMinutes: preference.unloadTimeoutMinutes,
		})
		return true
	} catch (error) {
		console.error('reloading on the CPU after the GPU ran out of memory failed', error)
		return false
	}
}

function errorParts(error: unknown) {
	const object = typeof error === 'object' && error !== null ? (error as { code?: string; message?: string }) : null
	return { code: object?.code, message: object?.message || String(error) }
}

/** Re-read the live title after every rename so slow disk I/O can never restore a stale draft. */
export async function reconcileProjectName(
	initialName: string,
	saved: SaveTranscriptResult,
	latestName: () => string | undefined,
	rename: (path: string, name: string) => Promise<TranscriptEntry | null> = renameTranscript,
	onRenamed?: (saved: SaveTranscriptResult) => void,
) {
	let current = saved
	let appliedName = initialName
	for (;;) {
		const desiredName = latestName()
		if (!desiredName || desiredName === appliedName) return current
		const renamed = await rename(current.recordPath, desiredName)
		if (!renamed) return current
		current = { recordPath: renamed.path, mediaPath: renamed.mediaPath ?? current.mediaPath }
		appliedName = desiredName
		onRenamed?.(current)
	}
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
	const projectOperationsRef = useRef(new Map<string, Promise<unknown>>())

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

	const serializeProjectOperation = useCallback(<T>(jobId: string, operation: () => Promise<T>): Promise<T> => {
		const previous = projectOperationsRef.current.get(jobId) ?? Promise.resolve()
		const current = previous.catch(() => undefined).then(operation)
		projectOperationsRef.current.set(jobId, current)
		void current.finally(() => {
			if (projectOperationsRef.current.get(jobId) === current) projectOperationsRef.current.delete(jobId)
		})
		return current
	}, [])

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
				projectsPath: current.projectsPath,
				moveSourceMedia: job.source === 'record' || job.source === 'url',
				segments,
				language: current.modelOptions.lang,
				modelPath: current.modelPath,
			}).then((saved) => {
				if (!saved) return
				// Vibe-owned staging media may be gone now; switch playback to the durable project copy
				// immediately, before any slower title reconciliation.
				patch(job.id, { savedPath: saved.recordPath, path: saved.mediaPath })
				void serializeProjectOperation(job.id, async () => {
					const final = await reconcileProjectName(
						job.name,
						saved,
						() => jobsRef.current.find((candidate) => candidate.id === job.id)?.name,
						renameTranscript,
						(step) => patch(job.id, { savedPath: step.recordPath, path: step.mediaPath }),
					)

					patch(job.id, { savedPath: final.recordPath, path: final.mediaPath })
					notifyTranscriptsChanged()
				})
			})
		},
		[patch, serializeProjectOperation],
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
			const current = preferenceRef.current
			if (!current.modelPath) {
				failPending(m.noModelSelected())
				toast.error(m.noModelSelected(), { position: 'bottom-center' })
				return
			}

			// Once the GPU runs out of memory the rest of the run stays on the CPU, and so does
			// this model on every later launch: a loaded model that fits can still overflow once
			// the working buffers of a long file or diarization arrive.
			let onCpu = current.noGpu || gpuOutOfMemoryBefore(current.modelPath)
			let shared: Record<string, unknown>
			try {
				const loadResult = await invoke<string>('load_model', {
					modelPath: current.modelPath,
					gpuDevice: current.gpuDevice,
					noGpu: onCpu,
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
				trackTranscribeStarted('main', next.path)
				try {
					const result = await invoke<Transcript>('transcribe', {
						options: {
							path: next.path,
							...withoutUnsupportedOptions(preferenceRef.current.modelOptions, preferenceRef.current.modelMetadata?.capabilities),
							...shared,
						},
					})
					const seconds = Math.round((performance.now() - startedAt) / 1000)
					patch(next.id, { status: 'done', progress: 100, segments: result.segments, seconds })
					completedAny = true
					if (next.savedPath) {
						// Renaming a project is asynchronous. Serialize the transcript write behind it and
						// re-read the live path so completion can never target the folder's old name.
						void serializeProjectOperation(next.id, async () => {
							const savedPath = jobsRef.current.find((candidate) => candidate.id === next.id)?.savedPath
							if (savedPath && (await updateTranscriptSegments(savedPath, result.segments))) notifyTranscriptsChanged()
						})
					} else {
						persist(next, result.segments)
					}
					// An abort resolves as a success carrying the partial segments, so only these flags tell them apart.
					if (abortCurrentRef.current || abortAllRef.current) {
						trackTranscribeCancelled('main', next.path)
					} else {
						trackTranscribeSucceeded('main', { durationSeconds: seconds, segmentsCount: result.segments.length })
					}
				} catch (error) {
					if (abortCurrentRef.current || abortAllRef.current) {
						patch(next.id, { status: 'cancelled', progress: 0 })
						trackTranscribeCancelled('main', next.path)
					} else {
						const { code, message } = errorParts(error)
						if (!onCpu && isGpuOutOfMemory(code, message) && (await reloadOnCpu(current))) {
							onCpu = true
							rememberGpuOutOfMemory(current.modelPath)
							trackGpuOutOfMemory('main', { signal: code === serverErrorCodes.GPU_OUT_OF_MEMORY ? 'error_code' : 'process_death' })
							toast.warning(m.gpuFallbackToCpu(), { position: 'bottom-center', duration: 8000 })
							// Back to the queue for one more try; on the CPU an overflow is the plain error.
							patch(next.id, { status: 'queued', progress: 0 })
							continue
						}
						patch(next.id, { status: 'error', progress: 0, error: message })
						const userError = Boolean(code && isUserError(code))
						trackTranscribeFailed('main', next.path, { errorMessage: message, userError })
						if (userError) {
							toast.error(`${m.error()}: ${message}`, { position: 'bottom-center' })
						} else {
							setErrorModal?.({ log: message, open: true })
							// A dead sidecar or an unloaded model fails every following file the same way.
							const fatal = fatalRunError(code, message)
							if (fatal) {
								toast.error(fatal === 'no_model' ? m.noModelLoadedBatchStopped() : m.transcribeEngineStoppedBatchStopped(), {
									position: 'bottom-center',
								})
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
	}, [commit, failPending, patch, persist, select, serializeProjectOperation, setErrorModal])

	const transcribeJob = useCallback(
		(jobId: string) => {
			const job = jobsRef.current.find((candidate) => candidate.id === jobId)
			if (!job?.hydrated || !job.savedPath || !job.path || !['done', 'error', 'cancelled'].includes(job.status) || job.segments.length > 0) return
			pinnedRef.current = true
			commit(jobsRef.current.map((candidate) => (candidate.id === jobId ? { ...candidate, status: 'queued', progress: 0, error: undefined } : candidate)))
			select(jobId)
			void runLoop()
		},
		[commit, runLoop, select],
	)

	const enqueue = useCallback(
		(files: EnqueueItem[]) => {
			const accepted = files.filter((file) => validPath(file.path.toLowerCase()))
			if (accepted.length === 0) {
				if (files.length > 0) toast.error(m.supportsFormats(), { position: 'bottom-center' })
				return
			}

			const created: Job[] = accepted.map((file) => ({
				id: nextJobId(),
				// A re-transcribed project keeps its own title: prefixing it again would grow
				// "File-multi" into "File-File-multi" on every run.
				name: file.projectName ?? autoProjectName(file.name, file.source ?? 'file'),
				path: file.path,
				source: file.source ?? 'file',
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
		(record: TranscriptRecord, savedPath: string, audioPath?: string | null, source?: ProjectSource) => {
			// Opening an older Recent while a run is active remains disallowed. A recording finish is
			// different: its durable project must enter the session even if another job is running.
			if (runningRef.current && source !== 'record') return null
			const id = nextJobId()
			const job: Job = {
				id,
				name: record.name,
				// The project folder's own copy of the media, else the original path it came from.
				path: audioPath || record.sourcePath,
				source,
				status: 'done',
				progress: 100,
				segments: record.segments,
				savedPath,
				hydrated: true,
				summary: record.summary,
				speakerNames: record.speakerNames,
			}
			pinnedRef.current = true
			commit(runningRef.current ? [...jobsRef.current, job] : [job])
			select(job.id)
			return id
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

	const setSegmentSpeaker = useCallback(
		(jobId: string, segmentIndex: number, speaker: number) => {
			const job = jobsRef.current.find((candidate) => candidate.id === jobId)
			const segment = job?.segments[segmentIndex]
			if (!job || !segment || segment.speaker === speaker) return
			const segments = job.segments.map((item, index) => (index === segmentIndex ? { ...item, speaker } : item))
			commit(jobsRef.current.map((candidate) => (candidate.id === jobId ? { ...candidate, segments } : candidate)))
			if (job.savedPath) void updateTranscriptSegments(job.savedPath, segments)
		},
		[commit],
	)

	const renameJob = useCallback(
		async (jobId: string, name: string) => {
			const next = name.trim()
			if (!next) return false
			return serializeProjectOperation(jobId, async () => {
				const job = jobsRef.current.find((candidate) => candidate.id === jobId)
				if (!job) return false
				if (!job.savedPath) {
					patch(jobId, { name: next })
					return true
				}
				const renamed = await renameTranscript(job.savedPath, next)
				if (!renamed) return false
				const latest = jobsRef.current.find((candidate) => candidate.id === jobId)
				patch(jobId, {
					...(latest?.name === job.name || latest?.name === next ? { name: next } : {}),
					savedPath: renamed.path,
					path: renamed.mediaPath ?? job.path,
				})
				notifyTranscriptsChanged()
				return true
			})
		},
		[patch, serializeProjectOperation],
	)

	const previewJobName = useCallback((jobId: string, name: string) => patch(jobId, { name }), [patch])

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

	const setSpeakerName = useCallback(
		(jobId: string, speaker: number, name: string) => {
			const job = jobsRef.current.find((candidate) => candidate.id === jobId)
			if (!job) return
			const next = name.trim()
			const speakerNames: SpeakerNames = { ...job.speakerNames }
			if (next) speakerNames[speaker] = next
			else delete speakerNames[speaker]
			if ((job.speakerNames?.[speaker] ?? '') === next) return
			commit(jobsRef.current.map((candidate) => (candidate.id === jobId ? { ...candidate, speakerNames } : candidate)))
			if (job.savedPath) void updateTranscriptSpeakerNames(job.savedPath, speakerNames)
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
		transcribeJob,
		hydrate,
		updateSegmentText,
		renameJob,
		previewJobName,
		setJobSummary,
		setSpeakerName,
		setSegmentSpeaker,
		cancelCurrent,
		cancelAll,
		reset,
	}
}
