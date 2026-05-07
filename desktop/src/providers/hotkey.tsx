import { ReactNode, createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { useLocalStorage } from 'usehooks-ts'
import { AudioDevice } from '~/lib/audio'
import { Claude, Llm, Ollama, OpenAICompatible } from '~/lib/llm'
import { createTranscriber } from '~/lib/transcription'
import * as transcript from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/preference'
import { useTranslation } from 'react-i18next'

// Module-level flag used by home viewModel to skip processing
// when hotkey-triggered recording finishes
export let hotkeyRecordingActive = false

export const DEFAULT_HOTKEY_SHORTCUT = 'CmdOrCtrl+Shift+V'

export type HotkeyOutputMode = 'clipboard' | 'type'
export type HotkeyMode = 'hold' | 'toggle'

interface HotkeyContextType {
	hotkeyEnabled: boolean
	setHotkeyEnabled: (enabled: boolean) => void
	hotkeyShortcut: string
	setHotkeyShortcut: (shortcut: string) => void
	hotkeyOutputMode: HotkeyOutputMode
	setHotkeyOutputMode: (mode: HotkeyOutputMode) => void
	hotkeyMode: HotkeyMode
	setHotkeyMode: (mode: HotkeyMode) => void
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

export function HotkeyProvider({ children }: { children: ReactNode }) {
	const { t } = useTranslation()
	const preference = usePreferenceProvider()
	const preferenceRef = useRef(preference)

	const [hotkeyEnabled, setHotkeyEnabled] = useLocalStorage('prefs_hotkey_enabled', false)
	const [hotkeyShortcut, setHotkeyShortcut] = useLocalStorage('prefs_hotkey_shortcut', DEFAULT_HOTKEY_SHORTCUT)
	const [hotkeyOutputMode, setHotkeyOutputMode] = useLocalStorage<HotkeyOutputMode>('prefs_hotkey_output_mode', 'clipboard')
	const [hotkeyMode, setHotkeyMode] = useLocalStorage<HotkeyMode>('prefs_hotkey_mode', 'hold')
	const [isHotkeyRecording, setIsHotkeyRecording] = useState(false)

	const isHotkeyRecordingRef = useRef(false)
	const isProcessingRef = useRef(false)
	const hotkeyOutputModeRef = useRef(hotkeyOutputMode)
	const hotkeyModeRef = useRef(hotkeyMode)
	const registeredShortcutRef = useRef<string | null>(null)

	useEffect(() => {
		preferenceRef.current = preference
	}, [preference])

	useEffect(() => {
		hotkeyOutputModeRef.current = hotkeyOutputMode
	}, [hotkeyOutputMode])

	useEffect(() => {
		hotkeyModeRef.current = hotkeyMode
	}, [hotkeyMode])

	const createLlm = useCallback((): Llm | null => {
		const config = preferenceRef.current.llmConfig
		if (!config?.enabled) return null
		if (config.platform === 'ollama') return new Ollama(config)
		if (config.platform === 'openai') return new OpenAICompatible(config)
		return new Claude(config)
	}, [])

	const handleHotkeyDown = useCallback(async () => {
		if (isHotkeyRecordingRef.current) return
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
			})
		} catch (error) {
			console.error('Hotkey start_record error:', error)
			isHotkeyRecordingRef.current = false
			hotkeyRecordingActive = false
			setIsHotkeyRecording(false)
		}
	}, [])

	const handleHotkeyUp = useCallback(async () => {
		if (!isHotkeyRecordingRef.current) return
		await emit('stop_record')
	}, [])

	// Listen for record_finish and process when hotkey-triggered
	useEffect(() => {
		const unlisten = listen<{ path: string; name: string }>('record_finish', async (event) => {
			if (!isHotkeyRecordingRef.current) return

			isProcessingRef.current = true
			const { path } = event.payload

			try {
				const transConfig = preferenceRef.current.transcriptionConfig
				let resultText: string

				if (transConfig.provider !== 'local') {
					// Cloud transcription
					const transcriber = createTranscriber(transConfig)
					if (!transcriber) {
						throw new Error('Invalid cloud transcription provider configuration')
					}
					const lang = preferenceRef.current.modelOptions.lang || undefined
					const result = await transcriber.transcribe(path, lang)
					resultText = transcript.asText(result.segments, t('common.speaker-prefix'))
				} else {
					// Local (sona) transcription
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
					resultText = transcript.asText(res.segments, t('common.speaker-prefix'))
				}

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

				resultText = resultText.trim()
				// Output result
				if (hotkeyOutputModeRef.current === 'type') {
					await invoke('type_text', { text: resultText })
				} else {
					await clipboard.writeText(resultText)
					await notify('Vibe', t('common.hotkey-transcription-copied'))
				}
			} catch (error) {
				console.error('Hotkey transcription error:', error)
				await notify('Vibe', String(error))
			} finally {
				isProcessingRef.current = false
				isHotkeyRecordingRef.current = false
				hotkeyRecordingActive = false
				setIsHotkeyRecording(false)
			}
		})

		return () => {
			unlisten.then((fn) => fn())
		}
	}, [createLlm, t])

	// Register/unregister shortcut
	useEffect(() => {
		let cancelled = false

		async function setupShortcut() {
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

			// RightControl is handled by native keyboard hook, not tauri-plugin-global-shortcut
			if (hotkeyShortcut === 'ControlRight' || hotkeyShortcut === 'RightControl') {
				registeredShortcutRef.current = hotkeyShortcut
				return
			}

			try {
				await register(hotkeyShortcut, (event) => {
					const isPressed = event.state === 'Pressed'
					const isReleased = event.state === 'Released'

					if (hotkeyModeRef.current === 'toggle') {
						if (!isPressed) return
						if (isProcessingRef.current) return
						if (isHotkeyRecordingRef.current) {
							handleHotkeyUp()
						} else {
							handleHotkeyDown()
						}
					} else {
						if (isPressed) {
							handleHotkeyDown()
						} else if (isReleased) {
							handleHotkeyUp()
						}
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
	}, [hotkeyEnabled, hotkeyShortcut, handleHotkeyDown, handleHotkeyUp])

	// Listen for native keyboard hook events (RightControl on Windows)
	useEffect(() => {
		if (!hotkeyEnabled) return
		if (hotkeyShortcut !== 'ControlRight' && hotkeyShortcut !== 'RightControl') return

		const unlistenPressed = listen<string>('native-shortcut-pressed', (event) => {
			if (event.payload !== 'RightControl') return
			if (hotkeyModeRef.current === 'toggle') {
				if (isProcessingRef.current) return
				if (isHotkeyRecordingRef.current) {
					handleHotkeyUp()
				} else {
					handleHotkeyDown()
				}
			} else {
				handleHotkeyDown()
			}
		})

		const unlistenReleased = listen<string>('native-shortcut-released', (event) => {
			if (event.payload !== 'RightControl') return
			if (hotkeyModeRef.current !== 'toggle') {
				handleHotkeyUp()
			}
		})

		return () => {
			unlistenPressed.then((fn) => fn())
			unlistenReleased.then((fn) => fn())
		}
	}, [hotkeyEnabled, hotkeyShortcut, handleHotkeyDown, handleHotkeyUp])

	const value: HotkeyContextType = {
		hotkeyEnabled,
		setHotkeyEnabled,
		hotkeyShortcut,
		setHotkeyShortcut,
		hotkeyOutputMode,
		setHotkeyOutputMode,
		hotkeyMode,
		setHotkeyMode,
		isHotkeyRecording,
	}

	return <HotkeyContext.Provider value={value}>{children}</HotkeyContext.Provider>
}
