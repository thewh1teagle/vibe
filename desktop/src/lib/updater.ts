/**
 * The update lifecycle is owned by Rust (see docs/UPDATER.md): it checks, downloads in the
 * background; the user installs with one click. The frontend only mirrors this state.
 */

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'failed'

/** Payload of the `update_state` command and the `update-state` event. */
export interface UpdateState {
	phase: UpdatePhase
	currentVersion: string
	/** The newer version, once known. */
	version?: string
	/** 0-100 while downloading. */
	percent?: number
	/** Set when `phase` is `failed`. */
	error?: string
	/** True while an install the user asked for is in progress. */
	interactive: boolean
	/** Remind the user now: Rust applies the waiting time and the snooze. */
	remind: boolean
}

/** Returned once by `update_take_notice` on the first launch after an update. */
export interface UpdateNotice {
	from: string
	to: string
}

/** Which `updater/<channel>.json` the app follows. */
export type UpdateChannel = 'stable' | 'beta'

/** Until Rust answers: nothing to offer. */
export const initialUpdateState: UpdateState = {
	phase: 'idle',
	currentVersion: '',
	interactive: false,
	remind: false,
}

/** A newer version is known and not installed yet. */
export function hasAvailableUpdate(state: UpdateState): boolean {
	switch (state.phase) {
		case 'available':
		case 'downloading':
		case 'ready':
			return true
		case 'failed':
			return Boolean(state.version)
		default:
			return false
	}
}

/** The progress dialog is only for an install the user asked for; background work stays silent. */
export function showsUpdateProgress(state: UpdateState): boolean {
	return state.interactive && (state.phase === 'downloading' || state.phase === 'ready' || state.phase === 'installing')
}

/** Bar value for the progress dialog: download percent, then full while installing. */
export function updateProgressValue(state: UpdateState): number {
	if (state.phase === 'downloading') return Math.max(0, Math.min(100, state.percent ?? 0))
	return 100
}

/** What the in-app reminder banner offers, or null when it stays hidden. */
export function reminderBanner(state: UpdateState): { kind: 'ready' | 'available'; version: string } | null {
	if (!state.remind || !state.version) return null
	if (state.phase === 'ready') return { kind: 'ready', version: state.version }
	if (state.phase === 'available' || state.phase === 'failed') return { kind: 'available', version: state.version }
	return null
}
