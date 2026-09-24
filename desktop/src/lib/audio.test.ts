import { describe, expect, it } from 'vitest'
import { clampLevel, inputLevelColor } from './audio'

describe('clampLevel', () => {
	it.each([
		[-1, 0],
		[0, 0],
		[0.42, 0.42],
		[1, 1],
		[2, 1],
	])('clamps %s to %s', (value, expected) => {
		expect(clampLevel(value)).toBe(expected)
	})

	it.each([Number.NaN, Infinity, 'loud', null, undefined])('falls back to 0 for %s', (value) => {
		expect(clampLevel(value)).toBe(0)
	})
})

describe('inputLevelColor', () => {
	it('reads red when quiet and green when loud', () => {
		expect(inputLevelColor(0)).toBe('hsl(0 80% 45%)')
		expect(inputLevelColor(1)).toBe('hsl(120 80% 45%)')
	})

	it('moves through the middle for a mid level', () => {
		expect(inputLevelColor(0.5)).toBe('hsl(60 80% 45%)')
	})
})
