import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { autoProjectName } from '~/lib/project-name'
import type { Segment } from '~/lib/transcript'
import { notifyTranscriptsChanged, saveTranscript } from '~/lib/transcripts-store'
import { usePreferenceProvider } from '~/providers/preference'

/**
 * Phone handoff transcripts land in Recents.
 *
 * A phone recording is transcribed entirely in Rust, so it never passes through the transcribe
 * queue that normally persists a finished job. Without this listener the result exists only as a
 * `handoff_activity` event and disappears the moment the app is closed.
 *
 * The Settings → Phone section listens to the same event, but it is mounted only while that modal
 * is open — and a phone transcription is by definition something that arrives while the user is
 * doing something else. This component is mounted once for the app's lifetime instead.
 */

interface HandoffActivity {
	state: 'receiving' | 'loading_model' | 'transcribing' | 'done' | 'error'
	message?: string | null
	/** Absolute path of the saved phone audio. Only on `done`; either spelling is accepted. */
	savedPath?: string | null
	saved_path?: string | null
	/** Everything below is only present on `done`, and only once the backend supplies it. */
	segments?: Segment[] | null
	language?: string | null
	modelPath?: string | null
	model_path?: string | null
	name?: string | null
}

function isSegment(value: unknown): value is Segment {
	if (typeof value !== 'object' || value === null) return false
	const candidate = value as Partial<Segment>
	return typeof candidate.text === 'string' && typeof candidate.start === 'number' && typeof candidate.stop === 'number'
}

/** Keep only well-formed segments; a payload without any is treated as "nothing to save". */
function usableSegments(payload: HandoffActivity): Segment[] {
	return Array.isArray(payload.segments) ? payload.segments.filter(isSegment) : []
}

export default function HandoffTranscriptSaver() {
	const preference = usePreferenceProvider()
	// The listener is registered once; reading the preference through a ref keeps it current.
	const preferenceRef = useRef(preference)
	// Guards against saving the same recording twice (a re-emitted event, a remount in dev).
	const savedRef = useRef(new Set<string>())

	useEffect(() => {
		preferenceRef.current = preference
	}, [preference])

	useEffect(() => {
		let unlisten: UnlistenFn | undefined
		let cancelled = false

		const pending = listen<HandoffActivity>('handoff_activity', ({ payload }) => {
			if (payload?.state !== 'done') return

			const segments = usableSegments(payload)
			// The backend may not carry the transcript yet; better nothing than an empty record.
			if (segments.length === 0) return

			const sourcePath = payload.savedPath ?? payload.saved_path ?? ''
			const name = autoProjectName(payload.name?.trim() || m.phoneRecording(), 'record')
			// Same rule as a local transcription: auto-save only when the user asked for it.
			if (!preferenceRef.current.saveTranscripts) return

			const key = sourcePath || `${name}:${segments.length}:${segments[0].start}`
			if (savedRef.current.has(key)) return
			savedRef.current.add(key)

			// Fire-and-forget, like the queue's own persist: saving must never block the UI.
			void saveTranscript({
				name,
				sourcePath,
				segments,
				language: payload.language ?? undefined,
				modelPath: payload.modelPath ?? payload.model_path ?? null,
			}).then((savedTranscriptPath) => {
				if (!savedTranscriptPath) {
					// Let it be retried if the same recording is announced again.
					savedRef.current.delete(key)
					return
				}
				notifyTranscriptsChanged()
				// Quiet, non-modal: the transcription happened while the user was looking elsewhere,
				// so a single line telling them where it went is worth more than silence.
				toast.success(m.phoneTranscriptionSaved(), { description: name, position: 'bottom-right' })
			})
		})

		void pending.then((fn) => {
			if (cancelled) fn()
			else unlisten = fn
		})

		return () => {
			cancelled = true
			unlisten?.()
		}
	}, [])

	return null
}
