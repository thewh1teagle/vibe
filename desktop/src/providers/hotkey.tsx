import { ReactNode, createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { useLocalStorage } from 'usehooks-ts'
import { AudioDevice } from '~/lib/audio'
import { Claude, Llm, Ollama, OpenAICompatible } from '~/lib/llm'
import * as transcript from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/preference'
import { m } from '~/paraglide/messages.js'
import { hideDictationIndicator, showDictationIndicator } from '~/lib/dictation-indicator'

// Module-level flag used by home viewModel to skip processing
// when hotkey-triggered recording finishes
export let hotkeyRecordingActive = false

export const DEFAULT_HOTKEY_SHORTCUT = 'CmdOrCtrl+Shift+Space'

export type HotkeyOutputMode = 'clipboard' | 'type'
export type HotkeyActivationMode = 'push-to-talk' | 'toggle'

interface HotkeyContextType {
	hotkeyEnabled: boolean
	setHotkeyEnabled: (enabled: boolean) => void
	hotkeyShortcut: string
	setHotkeyShortcut: (shortcut: string) => void
	hotkeyOutputMode: HotkeyOutputMode
	setHotkeyOutputMode: (mode: HotkeyOutputMode) => void
	hotkeyActivationMode: HotkeyActivationMode
	setHotkeyActivationMode: (mode: HotkeyActivationMode) => void
	hotkeyNormalizeOutput: boolean
	setHotkeyNormalizeOutput: (enabled: boolean) => void
	isHotkeyRecording: boolean
}

const HotkeyContext = createContext<HotkeyContextType | null>(null)

export function useHotkeyProvider() {
	return useContext(HotkeyContext) as HotkeyContextType
}

async function ensureNotificationPermission(): Promise<boolean> {
	const granted = await invoke<boolean>('plugin:notification|is_permission_granted')
	if (granted) return true
	const result: string = await invoke('plugin:notification|request_permission')
	return result === 'granted'
}

async function notify(title: string, body: string) {
	try {
		const granted = await ensureNotificationPermission()
		if (!granted) return
		await invoke('plugin:notification|notify', { options: { title, body } })
	} catch (e) {
		console.error('Notification error:', e)
	}
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === 'object' && error !== null && 'message' in error) {
		const message = (error as { message?: unknown }).message
		if (typeof message === 'string') return message
	}
	return String(error)
}

export function HotkeyProvider({ children }: { children: ReactNode }) {
	const preference = usePreferenceProvider()
	const preferenceRef = useRef(preference)

	const [hotkeyEnabled, setHotkeyEnabled] = useLocalStorage('prefs_hotkey_enabled', false)
	const [hotkeyShortcut, setHotkeyShortcut] = useLocalStorage('prefs_hotkey_shortcut', DEFAULT_HOTKEY_SHORTCUT)
	const [hotkeyOutputMode, setHotkeyOutputMode] = useLocalStorage<HotkeyOutputMode>('prefs_hotkey_output_mode', 'clipboard')
	const [hotkeyActivationMode, setHotkeyActivationMode] = useLocalStorage<HotkeyActivationMode>('prefs_hotkey_activation_mode', 'push-to-talk')
	const [hotkeyNormalizeOutput, setHotkeyNormalizeOutput] = useLocalStorage('prefs_hotkey_normalize_output', true)
	const [isHotkeyRecording, setIsHotkeyRecording] = useState(false)

	const isHotkeyRecordingRef = useRef(false)
	const isStartingRef = useRef(false)
	const isStoppingRef = useRef(false)
	const shortcutPressedRef = useRef(false)
	const hotkeyOutputModeRef = useRef(hotkeyOutputMode)
	const hotkeyNormalizeOutputRef = useRef(hotkeyNormalizeOutput)
	const registeredShortcutRef = useRef<string | null>(null)
	const indicatorSessionRef = useRef(0)
	const indicatorTimerRef = useRef<number | null>(null)

	const showIndicator = useCallback((status: 'recording' | 'transcribing' | 'completed' | 'error', details: { output?: HotkeyOutputMode; message?: string } = {}) => {
		if (indicatorTimerRef.current) window.clearTimeout(indicatorTimerRef.current)
		showDictationIndicator({ sessionId: indicatorSessionRef.current, status, ...details })
	}, [])

	const finishIndicator = useCallback((status: 'completed' | 'error', details: { output?: HotkeyOutputMode; message?: string } = {}) => {
		const sessionId = indicatorSessionRef.current
		showIndicator(status, details)
		indicatorTimerRef.current = window.setTimeout(() => hideDictationIndicator(sessionId), status === 'error' ? 3500 : 1500)
	}, [showIndicator])

	useEffect(() => {
		preferenceRef.current = preference
	}, [preference])

	useEffect(() => {
		hotkeyOutputModeRef.current = hotkeyOutputMode
	}, [hotkeyOutputMode])

	useEffect(() => {
		hotkeyNormalizeOutputRef.current = hotkeyNormalizeOutput
	}, [hotkeyNormalizeOutput])

	const createLlm = useCallback((): Llm | null => {
		const config = preferenceRef.current.llmConfig
		if (!config?.enabled) return null
		if (config.platform === 'ollama') return new Ollama(config)
		if (config.platform === 'openai') return new OpenAICompatible(config)
		return new Claude(config)
	}, [])

	const handleHotkeyDown = useCallback(async () => {
		if (isHotkeyRecordingRef.current || isStartingRef.current || isStoppingRef.current) return
		isStartingRef.current = true
		try {
			const devices = await invoke<AudioDevice[]>('get_audio_devices')
			const defaultInput = devices.find((d) => d.isDefault && d.isInput)
			if (!defaultInput) {
				console.error('No default input device found')
				return
			}

			isHotkeyRecordingRef.current = true
			hotkeyRecordingActive = true
			setIsHotkeyRecording(true)

			await invoke('start_record', {
				devices: [defaultInput],
				storeInDocuments: false,
				customPath: null,
				recordingName: null,
			})
			indicatorSessionRef.current += 1
			showIndicator('recording')
		} catch (error) {
			console.error('Hotkey start_record error:', error)
			isHotkeyRecordingRef.current = false
			hotkeyRecordingActive = false
			setIsHotkeyRecording(false)
		} finally {
			isStartingRef.current = false
		}
	}, [showIndicator])

	const handleHotkeyUp = useCallback(async () => {
		if (!isHotkeyRecordingRef.current || isStoppingRef.current) return
		isStoppingRef.current = true
		try {
			await emit('stop_record')
		} catch (error) {
			isStoppingRef.current = false
			throw error
		}
	}, [])

	// Listen for record_finish and process when hotkey-triggered
	useEffect(() => {
		const unlisten = listen<{ path: string; name: string }>('record_finish', async (event) => {
			if (!isHotkeyRecordingRef.current) return

			const { path } = event.payload
			showIndicator('transcribing')

			try {
				const modelPath = preferenceRef.current.modelPath
				if (!modelPath) {
					throw new Error('No model selected')
				}

				await invoke('load_model', { modelPath, gpuDevice: preferenceRef.current.gpuDevice })
				const options = {
					path,
					...preferenceRef.current.modelOptions,
				}
				const res: transcript.Transcript = await invoke('transcribe', { options })
				let resultText = transcript.asText(res.segments, m.speakerPrefix())

				// Optional LLM summarization
				const llm = createLlm()
				if (llm && preferenceRef.current.llmConfig?.enabled) {
					try {
						const question = preferenceRef.current.llmConfig.prompt.replace('%s', resultText)
						resultText = await llm.ask(question)
					} catch (e) {
						console.error('Hotkey LLM error:', e)
					}
				}

				resultText = hotkeyNormalizeOutputRef.current ? transcript.normalizeWhitespace(resultText) : resultText.trim()
				// Output result
				if (hotkeyOutputModeRef.current === 'type') {
					await invoke('type_text', { text: resultText })
				} else {
					await clipboard.writeText(resultText)
					await notify('Vibe', m.hotkeyTranscriptionCopied())
				}
				finishIndicator('completed', { output: hotkeyOutputModeRef.current })
			} catch (error) {
				console.error('Hotkey transcription error:', error)
				const message = getErrorMessage(error)
				finishIndicator('error', { message })
				await notify('Vibe', message)
			} finally {
				isStoppingRef.current = false
				isHotkeyRecordingRef.current = false
				hotkeyRecordingActive = false
				setIsHotkeyRecording(false)
			}
		})

		return () => {
			unlisten.then((fn) => fn())
		}
	}, [createLlm, finishIndicator, showIndicator])

	useEffect(() => () => {
		if (indicatorTimerRef.current) window.clearTimeout(indicatorTimerRef.current)
	}, [])

	// Register/unregister shortcut
	useEffect(() => {
		let cancelled = false

		async function setupShortcut() {
			shortcutPressedRef.current = false
			// Unregister previous shortcut
			if (registeredShortcutRef.current) {
				try {
					if (await isRegistered(registeredShortcutRef.current)) {
						await unregister(registeredShortcutRef.current)
					}
				} catch (e) {
					console.error('Failed to unregister shortcut:', e)
				}
				registeredShortcutRef.current = null
			}

			if (!hotkeyEnabled || !hotkeyShortcut || cancelled) return

			try {
				await register(hotkeyShortcut, (event) => {
					if (hotkeyActivationMode === 'toggle') {
						if (event.state === 'Released') {
							shortcutPressedRef.current = false
							return
						}
						if (shortcutPressedRef.current) return
						shortcutPressedRef.current = true
						if (isHotkeyRecordingRef.current) handleHotkeyUp()
						else handleHotkeyDown()
					} else if (event.state === 'Pressed') {
						handleHotkeyDown()
					} else if (event.state === 'Released') {
						handleHotkeyUp()
					}
				})
				registeredShortcutRef.current = hotkeyShortcut
			} catch (e) {
				console.error('Failed to register shortcut:', e)
			}
		}

		setupShortcut()

		return () => {
			cancelled = true
			if (registeredShortcutRef.current) {
				unregister(registeredShortcutRef.current).catch(console.error)
				registeredShortcutRef.current = null
			}
		}
	}, [hotkeyEnabled, hotkeyShortcut, hotkeyActivationMode, handleHotkeyDown, handleHotkeyUp])

	const value: HotkeyContextType = {
		hotkeyEnabled,
		setHotkeyEnabled,
		hotkeyShortcut,
		setHotkeyShortcut,
		hotkeyOutputMode,
		setHotkeyOutputMode,
		hotkeyActivationMode,
		setHotkeyActivationMode,
		hotkeyNormalizeOutput,
		setHotkeyNormalizeOutput,
		isHotkeyRecording,
	}

	return <HotkeyContext.Provider value={value}>{children}</HotkeyContext.Provider>
}
