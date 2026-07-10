import { invoke } from '@tauri-apps/api/core'

export type DictationIndicatorStatus = 'recording' | 'transcribing' | 'completed' | 'error'

export interface DictationIndicatorState {
	sessionId: number
	status: DictationIndicatorStatus
	output?: 'clipboard' | 'type'
	message?: string
}

export const getDictationIndicatorEnabled = () => invoke<boolean>('get_dictation_indicator_enabled')
export const setDictationIndicatorEnabled = (enabled: boolean) => invoke<void>('set_dictation_indicator_enabled', { enabled })
export const getDictationIndicatorState = () => invoke<DictationIndicatorState | null>('get_dictation_indicator_state')

export async function showDictationIndicator(state: DictationIndicatorState) {
	try {
		await invoke<void>('show_dictation_indicator', { state })
	} catch (error) {
		console.error('Could not show dictation indicator:', error)
	}
}

export async function hideDictationIndicator(sessionId: number) {
	try {
		await invoke<void>('hide_dictation_indicator', { sessionId })
	} catch (error) {
		console.error('Could not hide dictation indicator:', error)
	}
}
