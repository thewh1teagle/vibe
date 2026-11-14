import { describe, expect, it } from 'vitest'
import { hasAvailableUpdate, initialUpdateState, reminderBanner, showsUpdateProgress, updateProgressValue, type UpdatePhase, type UpdateState } from './updater'

const at = (phase: UpdatePhase, extra: Partial<UpdateState> = {}): UpdateState => ({ ...initialUpdateState, currentVersion: '3.3.6', phase, ...extra })

describe('hasAvailableUpdate', () => {
	it('counts a known, not yet installed version', () => {
		for (const phase of ['available', 'downloading', 'ready'] as const) {
			expect(hasAvailableUpdate(at(phase, { version: '3.4.0' }))).toBe(true)
		}
	})

	it('counts a failure only when a newer version is known', () => {
		expect(hasAvailableUpdate(at('failed', { version: '3.4.0', error: 'network' }))).toBe(true)
		expect(hasAvailableUpdate(at('failed', { error: 'network' }))).toBe(false)
	})

	it('does not count idle, checking or installing', () => {
		for (const phase of ['idle', 'checking', 'installing'] as const) {
			expect(hasAvailableUpdate(at(phase, { version: '3.4.0' }))).toBe(false)
		}
	})
})

describe('showsUpdateProgress', () => {
	it('stays hidden for a background download or install', () => {
		expect(showsUpdateProgress(at('downloading', { percent: 40 }))).toBe(false)
		expect(showsUpdateProgress(at('installing'))).toBe(false)
	})

	it('shows for an install the user asked for', () => {
		expect(showsUpdateProgress(at('downloading', { percent: 40, interactive: true }))).toBe(true)
		expect(showsUpdateProgress(at('installing', { interactive: true }))).toBe(true)
		expect(showsUpdateProgress(at('failed', { interactive: true }))).toBe(false)
	})
})

describe('updateProgressValue', () => {
	it('follows the download, then fills while installing', () => {
		expect(updateProgressValue(at('downloading', { percent: 40 }))).toBe(40)
		expect(updateProgressValue(at('downloading'))).toBe(0)
		expect(updateProgressValue(at('installing'))).toBe(100)
	})
})

describe('reminderBanner', () => {
	it('stays hidden unless Rust says to remind', () => {
		expect(reminderBanner(at('ready', { version: '3.4.0' }))).toBeNull()
		expect(reminderBanner(at('ready', { version: '3.4.0', remind: true }))).toEqual({ kind: 'ready', version: '3.4.0' })
	})

	it('offers an update that is known but not downloaded', () => {
		expect(reminderBanner(at('available', { version: '3.4.0', remind: true }))).toEqual({ kind: 'available', version: '3.4.0' })
		expect(reminderBanner(at('failed', { version: '3.4.0', remind: true }))).toEqual({ kind: 'available', version: '3.4.0' })
		expect(reminderBanner(at('failed', { remind: true }))).toBeNull()
		expect(reminderBanner(at('downloading', { version: '3.4.0', remind: true }))).toBeNull()
	})
})
