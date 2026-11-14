import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))

import { toast } from 'sonner'
import { isLegacyDeviceId, resolveSavedDevice, selectInputDevice, warnDeviceFallback, type AudioDevice } from './audio'

const builtIn: AudioDevice = { isDefault: true, isInput: true, id: 'coreaudio:BuiltInMic', name: 'MacBook Pro Microphone' }
const yeti: AudioDevice = { isDefault: false, isInput: true, id: 'coreaudio:USB-1', name: 'Yeti' }
const teams: AudioDevice = { isDefault: false, isInput: true, id: 'coreaudio:Teams', name: 'Microsoft Teams Audio' }
const speakers: AudioDevice = { isDefault: true, isInput: false, id: 'coreaudio:Speakers', name: 'MacBook Pro Speakers' }

describe('resolveSavedDevice', () => {
	it('finds the saved device wherever it now sits in the list', () => {
		expect(resolveSavedDevice([builtIn, yeti], true, yeti.id)).toEqual({ device: yeti, missing: false })
		expect(resolveSavedDevice([teams, speakers, builtIn, yeti], true, yeti.id)).toEqual({ device: yeti, missing: false })
	})

	it('falls back to the default and flags a saved device that is not connected', () => {
		expect(resolveSavedDevice([teams, builtIn], true, yeti.id)).toEqual({ device: builtIn, missing: true })
		expect(resolveSavedDevice([teams], true, yeti.id)).toEqual({ device: null, missing: true })
	})

	it('does not match a device of the other direction', () => {
		expect(resolveSavedDevice([builtIn, speakers], false, builtIn.id)).toEqual({ device: speakers, missing: true })
	})

	it('treats an old list-position id as no saved device', () => {
		expect(isLegacyDeviceId('0')).toBe(true)
		expect(isLegacyDeviceId('coreaudio:USB-1')).toBe(false)
		// Index 0 used to be the mic; now it is the Teams driver. Never record from it.
		expect(resolveSavedDevice([teams, builtIn], true, '0')).toEqual({ device: builtIn, missing: false })
	})

	it('keeps the explicit "don\'t record" choice and uses the default when nothing was saved', () => {
		expect(resolveSavedDevice([builtIn], true, '')).toEqual({ device: null, missing: false })
		expect(resolveSavedDevice([builtIn, speakers], false, null)).toEqual({ device: speakers, missing: false })
	})

	it('tells two devices that share a name apart by id', () => {
		const first: AudioDevice = { isDefault: false, isInput: true, id: 'name:in:USB Audio', name: 'USB Audio' }
		const second: AudioDevice = { isDefault: false, isInput: true, id: 'name:in:USB Audio#2', name: 'USB Audio' }
		expect(selectInputDevice([first, second, builtIn], second.id)).toBe(second)
	})
})

describe('warnDeviceFallback', () => {
	it('names the missing device and warns once per key', () => {
		warnDeviceFallback('Yeti', 'MacBook Pro Microphone', 'in:coreaudio:USB-1')
		warnDeviceFallback('Yeti', 'MacBook Pro Microphone', 'in:coreaudio:USB-1')
		expect(toast.warning).toHaveBeenCalledTimes(1)
		const [, options] = vi.mocked(toast.warning).mock.calls[0]
		expect(String(options?.description)).toContain('Yeti')
	})
})
