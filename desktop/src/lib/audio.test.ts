import { describe, expect, it } from 'vitest'
import { selectInputDevice, type AudioDevice } from './audio'

const devices: AudioDevice[] = [
	{ id: 'default-output', name: 'Speakers', isInput: false, isDefault: true },
	{ id: 'default-input', name: 'Built-in Microphone', isInput: true, isDefault: true },
	{ id: 'chosen-input', name: 'USB Microphone', isInput: true, isDefault: false },
]

describe('input device selection', () => {
	it('uses the configured microphone instead of the default', () => {
		expect(selectInputDevice(devices, 'chosen-input')).toEqual(devices[2])
	})

	it('uses the default input only when no microphone is configured', () => {
		expect(selectInputDevice(devices, null)).toEqual(devices[1])
		expect(selectInputDevice([devices[0], devices[2]], null)).toBeNull()
	})

	it('does not silently switch microphones when the configured device is unavailable or cleared', () => {
		expect(selectInputDevice(devices, 'disconnected-input')).toBeNull()
		expect(selectInputDevice(devices, 'default-output')).toBeNull()
		expect(selectInputDevice(devices, '')).toBeNull()
	})
})
