import { invoke } from '@tauri-apps/api/core'
import { load } from '@tauri-apps/plugin-store'
import { audioExtensions, storeFilename, videoExtensions } from '~/lib/config'
import { getMediaDurationSeconds } from '~/lib/media'

export const analyticsEvents = {
	TRANSCRIBE_STARTED: 'transcribe_started',
	TRANSCRIBE_SUCCEEDED: 'transcribe_succeeded',
	TRANSCRIBE_FAILED: 'transcribe_failed',
	TRANSCRIBE_CANCELLED: 'transcribe_cancelled',
	GPU_OUT_OF_MEMORY: 'gpu_out_of_memory',
} as const

/** Which of the four transcription entry points an event came from. */
export type TranscribeSource = 'home' | 'batch' | 'main' | 'hotkey'

type AnalyticsProps = Record<string, string | number>

export async function trackAnalyticsEvent(eventName: string, props?: AnalyticsProps) {
	// Fails closed: a setting that cannot be read means no tracking. The backend checks again.
	try {
		const store = await load(storeFilename)
		const enabled = await store.get<boolean>('analytics_enabled')
		if (enabled === false) {
			return
		}
	} catch {
		return
	}
	void invoke('track_analytics_event', {
		name: eventName,
		props,
	}).catch((error) => {
		console.debug('analytics track failed', error)
	})
}

const mediaExtensions: readonly string[] = [...videoExtensions, ...audioExtensions]

/**
 * The file's media extension, lowercase, for analytics: `none` without one, `other` for anything
 * not on the media list. Only the basename is looked at, so a dot in a folder name
 * (`/Users/john.doe/rec`) can never send part of the path.
 */
export function fileExt(path: string): string {
	const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
	const dot = name.lastIndexOf('.')
	if (dot < 1) return 'none'
	const ext = name.slice(dot + 1).toLowerCase()
	if (!ext) return 'none'
	return /^[a-z0-9]{1,8}$/.test(ext) && mediaExtensions.includes(ext) ? ext : 'other'
}

/** The `code` of a backend `CommandError`, when it is a plain code; `unknown` otherwise. */
export function errorCode(error: unknown): string {
	const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
	return typeof code === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : 'unknown'
}

/**
 * Every transcription must report exactly one terminal event — succeeded, failed or cancelled — so
 * a start without one means the app died mid-run rather than "the user stopped it".
 *
 * The start event carries what is known before the run: the file's extension and how long the audio
 * is. Those are the denominator; attaching them only to successes made "do long files fail more?"
 * unanswerable.
 */
export async function trackTranscribeStarted(source: TranscribeSource, path: string) {
	// The duration read is a metadata load, which is why the event is not awaited by its callers.
	const seconds = await getMediaDurationSeconds(path)
	await trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_STARTED, {
		source,
		file_ext: fileExt(path),
		...(seconds === null ? {} : { audio_duration_seconds: seconds }),
	})
}

export function trackTranscribeSucceeded(source: TranscribeSource, options: { durationSeconds: number; segmentsCount: number }) {
	return trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_SUCCEEDED, {
		source,
		duration_seconds: options.durationSeconds,
		segments_count: options.segmentsCount,
	})
}

/**
 * `error_kind` separates the failures worth acting on from the ones the person caused (a broken
 * file, a bad request); user errors used to emit nothing at all, which lost their start events.
 * `error_code` is the backend's code (`errorCode`). The message may quote paths: the backend
 * scrubs every `error_message` of them before it is queued.
 */
export function trackTranscribeFailed(
	source: TranscribeSource,
	path: string,
	options: { errorCode: string; errorMessage: string; userError?: boolean },
) {
	return trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_FAILED, {
		source,
		error_code: options.errorCode,
		error_message: options.errorMessage,
		file_ext: fileExt(path),
		error_kind: options.userError ? 'user' : 'internal',
	})
}

/** The user stopped this run. The backend returns the partial result as a success, so only the UI knows. */
/**
 * The GPU ran out of memory mid-run and the model was reloaded on the CPU. `signal` says how it
 * showed: an error code from server, or the process aborting on the allocation.
 */
export function trackGpuOutOfMemory(source: TranscribeSource, options: { signal: 'error_code' | 'process_death' }) {
	void trackAnalyticsEvent(analyticsEvents.GPU_OUT_OF_MEMORY, { source, signal: options.signal })
}

export function trackTranscribeCancelled(source: TranscribeSource, path: string) {
	return trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_CANCELLED, {
		source,
		file_ext: fileExt(path),
	})
}
