// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { reconcileProjectName, useTranscribeQueue } from './use-transcribe-queue'

const tauri = vi.hoisted(() => ({
	listeners: new Map<string, (event: { payload: unknown }) => void>(),
	emitted: [] as [string, unknown][],
	transcribeCalls: [] as Record<string, unknown>[],
	finishTranscribe: null as ((value: unknown) => void) | null,
}))

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(async (command: string, args: Record<string, unknown>) => {
		if (command === 'load_model') return 'ok'
		if (command === 'transcribe') {
			tauri.transcribeCalls.push(args)
			return new Promise((resolve) => (tauri.finishTranscribe = resolve))
		}
		return null
	}),
}))
vi.mock('@tauri-apps/api/event', () => ({
	emit: vi.fn(async (event: string, payload?: unknown) => void tauri.emitted.push([event, payload])),
	listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
		tauri.listeners.set(event, handler)
		return () => tauri.listeners.delete(event)
	}),
}))
vi.mock('@tauri-apps/api/webviewWindow', () => ({ getCurrentWebviewWindow: () => ({ unminimize: vi.fn(), setFocus: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }))
vi.mock('~/assets/success.mp3', () => ({ default: '' }))
vi.mock('~/lib/analytics', () => ({
	errorCode: vi.fn(),
	trackGpuOutOfMemory: vi.fn(),
	trackTranscribeCancelled: vi.fn(),
	trackTranscribeFailed: vi.fn(),
	trackTranscribeStarted: vi.fn(),
	trackTranscribeSucceeded: vi.fn(),
}))
vi.mock('~/lib/keep-awake', () => ({ KEEP_AWAKE: { queue: 'queue' }, startKeepAwake: vi.fn(), stopKeepAwake: vi.fn() }))
vi.mock('~/lib/notify', () => ({ notify: vi.fn() }))
vi.mock('~/lib/gpu-memory', () => ({ gpuOutOfMemoryBefore: () => false, rememberGpuOutOfMemory: vi.fn() }))
vi.mock('~/providers/model-gates', () => ({ useModelGates: () => ({ ensureDiarizeModel: vi.fn(async () => true) }) }))
vi.mock('~/providers/preference', () => {
	const preference = {
		modelPath: '/models/model.bin',
		noGpu: false,
		gpuDevice: 0,
		unloadTimeoutMinutes: 5,
		diarizeEnabled: false,
		stableTimestampsEnabled: false,
		modelMetadata: null,
		modelOptions: { lang: 'en' },
		autoExport: { enabled: false },
		saveTranscripts: false,
		soundOnFinish: false,
		focusOnFinish: false,
	}
	return { usePreferenceProvider: () => preference }
})

const segment = (text: string) => ({ start: 0, stop: 100, text })

/** One file running in a fresh queue, with the backend's `transcribe` call still pending. */
async function startOne() {
	tauri.listeners.clear()
	tauri.emitted.length = 0
	tauri.transcribeCalls.length = 0
	const { result } = renderHook(() => useTranscribeQueue())
	await waitFor(() => expect(tauri.listeners.has('transcribe_restart')).toBe(true))
	act(() => result.current.enqueue([{ name: 'a.wav', path: '/media/a.wav' }]))
	await waitFor(() => expect(tauri.transcribeCalls).toHaveLength(1))
	const jobId = result.current.activeId as string
	return { result, jobId }
}

const deliver = (event: string, payload: unknown) => act(() => tauri.listeners.get(event)?.({ payload }))

describe('transcription identity', () => {
	it('names each transcription and cancels only that one', async () => {
		const { result, jobId } = await startOne()
		expect(tauri.transcribeCalls[0].transcriptionId).toBe(jobId)

		act(() => result.current.cancelCurrent())
		expect(tauri.emitted).toEqual([['abort_transcribe', jobId]])
	})

	it('drops the streamed lines when the backend runs the job again, and only for that job', async () => {
		const { result, jobId } = await startOne()
		deliver('new_segment', segment('first try'))
		deliver('transcribe_progress', 40)
		deliver('transcribe_restart', 'another-job')
		expect(result.current.jobs[0].segments).toHaveLength(1)

		deliver('transcribe_restart', jobId)
		expect(result.current.jobs[0]).toMatchObject({ segments: [], progress: 0, stage: 'preparing', status: 'running' })

		deliver('new_segment', segment('on the cpu'))
		await act(async () => tauri.finishTranscribe?.({ segments: [segment('on the cpu')], processing_time_sec: 1 }))
		await waitFor(() => expect(result.current.jobs[0].status).toBe('done'))
		expect(result.current.jobs[0].segments.map((s) => s.text)).toEqual(['on the cpu'])
	})

	it('starting anew while a file runs keeps it running and queues the next behind it (#1477)', async () => {
		const { result, jobId } = await startOne()
		act(() => result.current.reset())
		expect(tauri.emitted).toEqual([])
		expect(result.current.jobs.map((job) => [job.id, job.status])).toEqual([[jobId, 'running']])

		act(() => result.current.enqueue([{ name: 'b.wav', path: '/media/b.wav' }]))
		expect(result.current.jobs.map((job) => job.status)).toEqual(['running', 'queued'])
		expect(tauri.transcribeCalls).toHaveLength(1)
	})
})

describe('project name reconciliation', () => {
	it('keeps reconciling when the live title changes during a slow rename', async () => {
		let liveName = 'Second draft'
		const rename = vi.fn(async (_path: string, name: string) => {
			if (name === 'Second draft') liveName = 'Final title'
			return {
				path: `/projects/${name}/transcript.vibe.json`,
				mediaPath: `/projects/${name}/audio.wav`,
				name,
				createdAt: new Date(0),
			}
		})

		const result = await reconcileProjectName(
			'Original',
			{ recordPath: '/projects/Original/transcript.vibe.json', mediaPath: '/projects/Original/audio.wav' },
			() => liveName,
			rename,
		)

		expect(rename.mock.calls.map(([, name]) => name)).toEqual(['Second draft', 'Final title'])
		expect(result).toEqual({
			recordPath: '/projects/Final title/transcript.vibe.json',
			mediaPath: '/projects/Final title/audio.wav',
		})
	})
})
