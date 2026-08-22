export const sonaErrorCodes = {
	INVALID_REQUEST: 'invalid_request',
	INVALID_AUDIO: 'invalid_audio',
	BUSY: 'busy',
	NO_MODEL: 'no_model',
	INTERNAL_ERROR: 'internal_error',
} as const

type UserErrorCode = typeof sonaErrorCodes.INVALID_AUDIO | typeof sonaErrorCodes.INVALID_REQUEST

const userErrorCodes: Set<UserErrorCode> = new Set([sonaErrorCodes.INVALID_AUDIO, sonaErrorCodes.INVALID_REQUEST])

export function isUserError(code: string): code is UserErrorCode {
	return userErrorCodes.has(code as UserErrorCode)
}

/**
 * Prefix of the message the backend builds when the sona sidecar died under a running
 * transcription; it carries the exit code or signal after it. There is no dedicated error code for
 * it — the backend reports `internal_error` — so the prose is the only marker, kept here rather
 * than at each call site (see `src-tauri/src/cmd/transcribe.rs`, `SONA_DIED`).
 */
const SONA_DIED_PREFIX = 'sona process died'

export type FatalRunError = 'no_model' | 'engine_died'

/**
 * Why this error dooms every file still queued behind the one that hit it, or `null` when it only
 * concerns this file. A dead sidecar or an unloaded model fails the whole run, so the queue must
 * stop: 16 installs looping over their queue produced half of all failure events in a 30-day window.
 */
export function fatalRunError(code: string | undefined, message: string): FatalRunError | null {
	if (code === sonaErrorCodes.NO_MODEL || message.includes('no model loaded')) return 'no_model'
	if (message.includes(SONA_DIED_PREFIX)) return 'engine_died'
	return null
}
