import { invoke } from '@tauri-apps/api/core'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { readConfig, writeConfig } from '~/lib/config-store'

export interface AudioDevice {
	isDefault: boolean
	isInput: boolean
	id: string
	name: string
}

/** deviceId → epoch ms of the last successful recording start that used that input. */
export type RecentInputActivity = Record<string, number>

/**
 * Pick the input device to record with when no explicit choice applies.
 *
 * Order: saved id (if still present) → device marked default → most recently
 * used input → first available input. The last two steps cover hosts where
 * `default_input_device()` never matches the enumerated list (common on ALSA
 * via PipeWire), which otherwise surfaces as "No default microphone".
 */
export function findInputDevice(
	devices: AudioDevice[],
	savedId?: string | null,
	recentActivity?: RecentInputActivity | null,
): AudioDevice | null {
	const inputs = devices.filter((device) => device.isInput)
	if (inputs.length === 0) return null

	if (savedId) {
		const saved = inputs.find((device) => device.id === savedId)
		if (saved) return saved
	}

	const marked = inputs.find((device) => device.isDefault)
	if (marked) return marked

	if (recentActivity) {
		let best: AudioDevice | null = null
		let bestAt = -1
		for (const device of inputs) {
			const at = recentActivity[device.id]
			if (typeof at === 'number' && at > bestAt) {
				best = device
				bestAt = at
			}
		}
		if (best) return best
	}

	return inputs[0] ?? null
}

/** Stamp `deviceId` as the most recently used input so the next fallback prefers it. */
export function noteInputDeviceUsed(deviceId: string) {
	const activity = readConfig<RecentInputActivity>(CONFIG_KEYS.recentInputDeviceActivity, {})
	writeConfig(CONFIG_KEYS.recentInputDeviceActivity, {
		...activity,
		[deviceId]: Date.now(),
	})
}

/** Most-recent-first activity map for `findInputDevice`, read from the config store. */
export function readRecentInputActivity(): RecentInputActivity {
	return readConfig<RecentInputActivity>(CONFIG_KEYS.recentInputDeviceActivity, {})
}

/** Payload of the backend `input_level` event: live 0..1 peak of one input device, ~10/s. */
export interface InputLevelPayload {
	deviceId: string
	level: number
}

export const startInputLevelPreview = () => invoke<void>('start_input_level_preview')

export const stopInputLevelPreview = () => invoke<void>('stop_input_level_preview')

/** Clamp a raw meter value to the 0..1 range the UI expects. */
export function clampLevel(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0
}

/**
 * Meter color for a 0..1 level: quiet reads red, loud reads green.
 * Hue interpolates 0 (red) → 120 (green) so the fill color encodes the level.
 */
export function inputLevelColor(level: number): string {
	const hue = Math.round(clampLevel(level) * 120)
	return `hsl(${hue} 80% 45%)`
}
