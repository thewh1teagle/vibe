import { describe, expect, it } from 'vitest'
import { clampLevel, findInputDevice, inputLevelColor, type AudioDevice } from './audio'

function input(id: string, overrides: Partial<AudioDevice> = {}): AudioDevice {
	return { id, name: id, isInput: true, isDefault: false, ...overrides }
}

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

describe('findInputDevice', () => {
	it('returns null when there are no inputs', () => {
		expect(findInputDevice([{ id: '0', name: 'out', isInput: false, isDefault: true }])).toBeNull()
	})

	it('prefers the saved id when that input is still present', () => {
		const devices = [input('a'), input('b', { isDefault: true })]
		expect(findInputDevice(devices, 'b')?.id).toBe('b')
		expect(findInputDevice(devices, 'a')?.id).toBe('a')
	})

	it('ignores a stale saved id and falls through to default', () => {
		const devices = [input('a'), input('b', { isDefault: true })]
		expect(findInputDevice(devices, 'gone')?.id).toBe('b')
	})

	it('uses the device marked default when there is no saved id', () => {
		const devices = [input('a'), input('b', { isDefault: true }), input('c')]
		expect(findInputDevice(devices)?.id).toBe('b')
	})

	it('falls back to the most recently used input when no default is marked', () => {
		const devices = [input('a'), input('b'), input('c')]
		expect(findInputDevice(devices, null, { a: 100, c: 300, b: 200 })?.id).toBe('c')
	})

	it('falls back to the first input when nothing else applies', () => {
		expect(findInputDevice([input('a'), input('b')])?.id).toBe('a')
	})

	it('ignores activity entries that are not finite numbers', () => {
		const devices = [input('a'), input('b')]
		expect(findInputDevice(devices, null, { a: Number.NaN, b: 5 })?.id).toBe('b')
		expect(findInputDevice(devices, null, { a: Number.NaN, b: Number.NaN })?.id).toBe('a')
	})
})
