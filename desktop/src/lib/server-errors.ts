export const serverErrorCodes = {
	INVALID_REQUEST: 'invalid_request',
	INVALID_AUDIO: 'invalid_audio',
	BUSY: 'busy',
	NO_MODEL: 'no_model',
	/** The GPU could not allocate; reloading on the CPU is the one thing a client can do about it. */
	GPU_OUT_OF_MEMORY: 'gpu_out_of_memory',
	/** System memory ran out, so the CPU would fail the same way. */
	OUT_OF_MEMORY: 'out_of_memory',
	INTERNAL_ERROR: 'internal_error',
} as const

type UserErrorCode = typeof serverErrorCodes.INVALID_AUDIO | typeof serverErrorCodes.INVALID_REQUEST

const userErrorCodes: Set<UserErrorCode> = new Set([serverErrorCodes.INVALID_AUDIO, serverErrorCodes.INVALID_REQUEST])

export function isUserError(code: string): code is UserErrorCode {
	return userErrorCodes.has(code as UserErrorCode)
}

/**
 * Prefix of the message the backend builds when the server sidecar died under a running
 * transcription; it carries the exit code or signal after it. There is no dedicated error code for
 * it — the backend reports `internal_error` — so the prose is the only marker, kept here rather
 * than at each call site (see `src-tauri/src/cmd/transcribe.rs`, `SERVER_DIED`).
 */
const SERVER_DIED_PREFIX = 'vibe-server process died'

export type FatalRunError = 'no_model' | 'engine_died'

/** What Rust prints before aborting when an allocation fails; the process dies without an error code. */
const ALLOCATION_FAILED = /memory allocation of \d+ bytes failed/

/**
 * Whether the GPU ran out of memory. server names it with a code when it can answer at all; when the
 * allocation aborts the process instead, the only evidence is the stderr in the death report, and
 * the caller decides whether the GPU was even in use. A plain `out_of_memory` is system RAM, which
 * the CPU cannot fix, so it stays false.
 */
export function isGpuOutOfMemory(code: string | undefined, message: string): boolean {
	if (code === serverErrorCodes.GPU_OUT_OF_MEMORY) return true
	return message.includes(SERVER_DIED_PREFIX) && ALLOCATION_FAILED.test(message)
}

/**
 * Why this error dooms every file still queued behind the one that hit it, or `null` when it only
 * concerns this file. A dead sidecar or an unloaded model fails the whole run, so the queue must
 * stop: 16 installs looping over their queue produced half of all failure events in a 30-day window.
 */
export function fatalRunError(code: string | undefined, message: string): FatalRunError | null {
	if (code === serverErrorCodes.NO_MODEL || message.includes('no model loaded')) return 'no_model'
	if (message.includes(SERVER_DIED_PREFIX)) return 'engine_died'
	return null
}
