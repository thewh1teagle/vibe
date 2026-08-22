import { invoke } from '@tauri-apps/api/core'

/**
 * Keep-awake holds are named so that overlapping ones do not fight: a background
 * hold must survive a transcription finishing and releasing its own. Releasing a
 * name that is not held is a no-op, so callers can stop defensively.
 */
export const KEEP_AWAKE = {
	transcribe: 'transcribe',
	queue: 'queue',
	batch: 'batch',
	record: 'record',
	/** Held for as long as the app runs, when the user asks for it in settings. */
	background: 'background',
} as const

export type KeepAwakeTag = (typeof KEEP_AWAKE)[keyof typeof KEEP_AWAKE]

export interface KeepAwakeFlags {
	/** Keep the display on. Only for work the user is sitting and watching. */
	display?: boolean
	/** Keep the system from sleeping on its idle timer. */
	idle?: boolean
}

/** Work the user started and is watching: hold the display too. */
const FOREGROUND: KeepAwakeFlags = { display: true, idle: true }

export async function startKeepAwake(tag: KeepAwakeTag, flags: KeepAwakeFlags = FOREGROUND) {
	try {
		await invoke('keepawake_start', { tag, flags })
	} catch (e) {
		console.error(`Keep awake failed: ${e}`)
	}
}

export async function stopKeepAwake(tag: KeepAwakeTag) {
	try {
		await invoke('keepawake_stop', { tag })
	} catch (e) {
		console.error(`Keep awake failed: ${e}`)
	}
}
