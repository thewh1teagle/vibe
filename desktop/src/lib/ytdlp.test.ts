import { describe, expect, it } from 'vitest'
import { isNewerVersion } from './ytdlp'

describe('isNewerVersion', () => {
	it('compares calendar versions by number, not as strings', () => {
		expect(isNewerVersion('2026.08.19', '2026.02.04')).toBe(true)
		expect(isNewerVersion('2026.02.04', '2026.08.19')).toBe(false)
		// The string compare this replaces got these two backwards.
		expect(isNewerVersion('2026.10.01', '2026.09.30')).toBe(true)
		expect(isNewerVersion('2026.09.30', '2026.10.01')).toBe(false)
	})

	it('treats the same version as not newer, which is what stops the nagging', () => {
		expect(isNewerVersion('2026.08.19', '2026.08.19')).toBe(false)
	})

	it('handles the same-day suffix yt-dlp occasionally publishes', () => {
		expect(isNewerVersion('2026.08.19.1', '2026.08.19')).toBe(true)
		expect(isNewerVersion('2026.08.19', '2026.08.19.1')).toBe(false)
	})

	it('offers an update when nothing is installed or the stored version is junk', () => {
		expect(isNewerVersion('2026.08.19', null)).toBe(true)
		expect(isNewerVersion('2026.08.19', undefined)).toBe(true)
		expect(isNewerVersion('2026.08.19', 'nightly')).toBe(true)
	})

	it('never prompts on a candidate it cannot parse', () => {
		expect(isNewerVersion('nightly', '2026.08.19')).toBe(false)
		expect(isNewerVersion('', '2026.08.19')).toBe(false)
	})
})
