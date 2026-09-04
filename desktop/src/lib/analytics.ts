import { invoke } from '@tauri-apps/api/core'
import { load } from '@tauri-apps/plugin-store'
import { storeFilename } from '~/lib/config'
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
	try {
		const store = await load(storeFilename)
		const enabled = await store.get<boolean>('analytics_enabled')
		if (enabled === false) {
			return
		}
	} catch {
		// If store fails, proceed with tracking
	}
	void invoke('track_analytics_event', {
		name: eventName,
		props,
	}).catch((error) => {
		console.debug('analytics track failed', error)
	})
}

function fileExt(path: string) {
	return path.split('.').pop() ?? 'unknown'
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
 */
export function trackTranscribeFailed(source: TranscribeSource, path: string, options: { errorMessage: string; userError?: boolean }) {
	return trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_FAILED, {
		source,
		error_message: options.errorMessage,
		file_ext: fileExt(path),
		error_kind: options.userError ? 'user' : 'internal',
	})
}

/** The user stopped this run. The backend returns the partial result as a success, so only the UI knows. */
/**
 * The GPU ran out of memory mid-run and the model was reloaded on the CPU. `signal` says how it
 * showed: an error code from sona, or the process aborting on the allocation.
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
