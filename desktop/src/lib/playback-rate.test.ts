import { describe, expect, it } from 'vitest'
import { nextPlaybackRate } from './playback-rate'

describe('nextPlaybackRate', () => {
	it.each([
		[1, 1.5],
		[1.5, 2],
		[2, 1],
	] as const)('cycles %sx to %sx', (current, next) => {
		expect(nextPlaybackRate(current)).toBe(next)
	})

	it('recovers an invalid persisted value into the normal cycle', () => {
		expect(nextPlaybackRate(3)).toBe(1.5)
	})
})
