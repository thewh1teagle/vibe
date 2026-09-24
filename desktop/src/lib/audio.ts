import { invoke } from '@tauri-apps/api/core'

export interface AudioDevice {
	isDefault: boolean
	isInput: boolean
	id: string
	name: string
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
