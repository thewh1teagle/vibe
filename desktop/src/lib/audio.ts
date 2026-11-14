import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'

export interface AudioDevice {
	isDefault: boolean
	isInput: boolean
	/**
	 * Stable identity from Rust: cpal's device id (`"<host>:<uid>"`), or `name:<in|out>:<name>` when
	 * the backend has none. Never a list position, so it survives devices connecting (#1676).
	 */
	id: string
	name: string
}

/** A requested device the recorder could not find, and the default it records from instead. */
export interface DeviceFallback {
	requested: string
	used: string
	isInput: boolean
}

/** What `start_record` returns. */
export interface StartRecordOutcome {
	deviceFallbacks: DeviceFallback[]
}

export interface SavedDeviceResolution {
	device: AudioDevice | null
	/** A real saved device is not connected; `device` is the system default standing in for it. */
	missing: boolean
}

/**
 * Ids saved before #1676 were list positions ("0", "3"). The list has likely moved since, so an
 * old id cannot be trusted: it means "no saved device", i.e. the system default.
 */
export function isLegacyDeviceId(id: string) {
	return /^\d+$/.test(id)
}

/**
 * The saved device of one direction, or the system default when there is none.
 *
 * `''` is the user's explicit "don't record" choice. A saved device that is not connected resolves
 * to the default with `missing` set, so the caller tells the user rather than switching silently,
 * and keeps the saved id so the device comes back when it reconnects.
 */
export function resolveSavedDevice(devices: AudioDevice[], isInput: boolean, savedId: string | null): SavedDeviceResolution {
	const candidates = devices.filter((device) => device.isInput === isInput)
	if (savedId === '') return { device: null, missing: false }
	const fallback = candidates.find((device) => device.isDefault) ?? null
	if (savedId === null || isLegacyDeviceId(savedId)) return { device: fallback, missing: false }
	const saved = candidates.find((device) => device.id === savedId)
	return saved ? { device: saved, missing: false } : { device: fallback, missing: true }
}

/** The microphone picked on the home page, or the system default when none was picked or it is gone. */
export function selectInputDevice(devices: AudioDevice[], savedId: string | null): AudioDevice | null {
	return resolveSavedDevice(devices, true, savedId).device
}

/**
 * Tells the user that a chosen device is not connected and which default stands in for it, so a
 * recording never switches device silently. `onceKey` limits a repeat of the same warning (e.g.
 * every time the record tab opens) to one per session.
 */
const warnedMissingDevices = new Set<string>()
export function warnDeviceFallback(name: string, fallback: string | null, onceKey?: string) {
	if (onceKey !== undefined) {
		if (warnedMissingDevices.has(onceKey)) return
		warnedMissingDevices.add(onceKey)
	}
	toast.warning(m.recordingDeviceMissingTitle(), {
		description: fallback ? m.recordingDeviceMissing({ name, fallback }) : name,
		position: 'bottom-center',
		duration: 10000,
	})
}
