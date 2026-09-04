import { ReactNode, createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { trackTranscribeFailed, trackTranscribeStarted, trackTranscribeSucceeded } from '~/lib/analytics'
import { AudioDevice } from '~/lib/audio'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { usePersisted } from '~/lib/config-store'
import { Claude, Llm, Ollama, OpenAICompatible } from '~/lib/llm'
import { withoutUnsupportedOptions } from '~/lib/model'
import { isUserError } from '~/lib/sona-errors'
import * as transcript from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/preference'
import { m } from '~/paraglide/messages.js'
import { hideDictationIndicator, showDictationIndicator } from '~/lib/dictation-indicator'
import * as config from '~/lib/config'

// Module-level flag used by home viewModel to skip processing
// when hotkey-triggered recording finishes
export let hotkeyRecordingActive = false

// Lives in lib/config so modules without a React dependency (the agent skill) can read the default.
export const getDefaultHotkeyShortcut = config.getDefaultHotkeyShortcut

export type HotkeyOutputMode = 'clipboard' | 'type'
export type HotkeyActivationMode = 'push-to-talk' | 'toggle'

interface HotkeyContextType {
	hotkeyEnabled: boolean
	setHotkeyEnabled: (enabled: boolean) => void
	hotkeyShortcut: string
	setHotkeyShortcut: (shortcut: string) => void
	/** While true the shortcut is unregistered, so recording a new one cannot trigger dictation. */
	setHotkeyCapturing: (capturing: boolean) => void
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

function getErrorCode(error: unknown): string | undefined {
	if (typeof error === 'object' && error !== null && 'code' in error) {
		const code = (error as { code?: unknown }).code
		if (typeof code === 'string') return code
	}
	return undefined
}

export function HotkeyProvider({ children }: { children: ReactNode }) {
	const preference = usePreferenceProvider()
	const preferenceRef = useRef(preference)

	const [hotkeyEnabled, setHotkeyEnabled] = usePersisted(CONFIG_KEYS.hotkeyEnabled, false)
	const [hotkeyShortcut, setHotkeyShortcut] = usePersisted(CONFIG_KEYS.hotkeyShortcut, getDefaultHotkeyShortcut())
	const [hotkeyCapturing, setHotkeyCapturingState] = useState(false)
	const [hotkeyOutputMode, setHotkeyOutputMode] = usePersisted<HotkeyOutputMode>(CONFIG_KEYS.hotkeyOutputMode, 'clipboard')
	const [hotkeyActivationMode, setHotkeyActivationMode] = usePersisted<HotkeyActivationMode>(CONFIG_KEYS.hotkeyActivationMode, 'push-to-talk')
	const shortcutOperationRef = useRef<Promise<void>>(Promise.resolve())
	const [hotkeyNormalizeOutput, setHotkeyNormalizeOutput] = usePersisted(CONFIG_KEYS.hotkeyNormalizeOutput, true)
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

	const showIndicator = useCallback(
		(status: 'recording' | 'transcribing' | 'completed' | 'error', details: { output?: HotkeyOutputMode; message?: string } = {}) => {
			if (indicatorTimerRef.current) window.clearTimeout(indicatorTimerRef.current)
			showDictationIndicator({ sessionId: indicatorSessionRef.current, status, ...details })
		},
		[],
	)

	const finishIndicator = useCallback(
		(status: 'completed' | 'error', details: { output?: HotkeyOutputMode; message?: string } = {}) => {
			const sessionId = indicatorSessionRef.current
			showIndicator(status, details)
			indicatorTimerRef.current = window.setTimeout(() => hideDictationIndicator(sessionId), status === 'error' ? 3500 : 1500)
		},
		[showIndicator],
	)

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

			// Dictation is a transcription like any other: one start, one terminal event.
			trackTranscribeStarted('hotkey', path)
			let transcribed = false
			try {
				const modelPath = preferenceRef.current.modelPath
				if (!modelPath) {
					throw new Error('No model selected')
				}

				await invoke('load_model', {
					modelPath,
					gpuDevice: preferenceRef.current.gpuDevice,
					noGpu: preferenceRef.current.noGpu,
					unloadTimeoutMinutes: preferenceRef.current.unloadTimeoutMinutes,
				})
				const requiresVad = preferenceRef.current.modelMetadata?.capabilities.requires_vad ?? false
				const modelsFolder = requiresVad ? await invoke<string>('get_models_folder') : null
				const options = {
					path,
					...withoutUnsupportedOptions(preferenceRef.current.modelOptions, preferenceRef.current.modelMetadata?.capabilities),
					...(requiresVad ? { vad_model: `${modelsFolder}/${config.vadModelFilename}` } : {}),
				}
				const startedAt = performance.now()
				const res: transcript.Transcript = await invoke('transcribe', { options })
				transcribed = true
				trackTranscribeSucceeded('hotkey', {
					durationSeconds: Math.round((performance.now() - startedAt) / 1000),
					segmentsCount: res.segments.length,
				})
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
				// Dictation has no cancel and no error modal, so the failure event is the only trace it leaves.
				// Anything that goes wrong after the transcript is in hand already reported its success.
				if (!transcribed) {
					const code = getErrorCode(error)
					trackTranscribeFailed('hotkey', path, { errorMessage: message, userError: Boolean(code && isUserError(code)) })
				}
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

	useEffect(() => {
		const unlisten = listen<string | { message?: string }>('record_error', ({ payload }) => {
			if (!isHotkeyRecordingRef.current) return
			const message = typeof payload === 'string' ? payload : payload?.message || m.error()
			finishIndicator('error', { message })
			void notify('Vibe', message)
			// Keep the module flag true for the rest of this event dispatch so SessionProvider knows
			// this was dictation, then release every dictation state before the next task.
			queueMicrotask(() => {
				isStartingRef.current = false
				isStoppingRef.current = false
				isHotkeyRecordingRef.current = false
				hotkeyRecordingActive = false
				setIsHotkeyRecording(false)
			})
		})
		return () => {
			unlisten.then((dispose) => dispose())
		}
	}, [finishIndicator])

	useEffect(
		() => () => {
			if (indicatorTimerRef.current) window.clearTimeout(indicatorTimerRef.current)
		},
		[],
	)

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

			if (!hotkeyEnabled || hotkeyCapturing || !hotkeyShortcut || cancelled) return

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
				if (cancelled) {
					await unregister(hotkeyShortcut)
					return
				}
				registeredShortcutRef.current = hotkeyShortcut
			} catch (e) {
				console.error('Failed to register shortcut:', e)
			}
		}

		shortcutOperationRef.current = shortcutOperationRef.current.then(setupShortcut, setupShortcut)

		return () => {
			cancelled = true
			shortcutOperationRef.current = shortcutOperationRef.current.then(async () => {
				const shortcut = registeredShortcutRef.current
				if (!shortcut) return
				try {
					if (await isRegistered(shortcut)) await unregister(shortcut)
				} catch (error) {
					console.error('Failed to unregister shortcut:', error)
				} finally {
					if (registeredShortcutRef.current === shortcut) registeredShortcutRef.current = null
				}
			})
		}
	}, [hotkeyEnabled, hotkeyCapturing, hotkeyShortcut, hotkeyActivationMode, handleHotkeyDown, handleHotkeyUp])

	/**
	 * A registered global shortcut is swallowed system-wide — the settings recorder would never see
	 * the very combo it is trying to replace. Release it the moment capture starts instead of waiting
	 * for the registration effect to catch up.
	 */
	const setHotkeyCapturing = useCallback((capturing: boolean) => {
		setHotkeyCapturingState(capturing)
		if (!capturing) return
		shortcutOperationRef.current = shortcutOperationRef.current.then(async () => {
			const shortcut = registeredShortcutRef.current
			if (!shortcut) return
			try {
				if (await isRegistered(shortcut)) await unregister(shortcut)
			} catch (error) {
				console.error('Failed to release shortcut for capture:', error)
			} finally {
				registeredShortcutRef.current = null
			}
		})
	}, [])

	const value: HotkeyContextType = {
		hotkeyEnabled,
		setHotkeyEnabled,
		hotkeyShortcut,
		setHotkeyShortcut,
		setHotkeyCapturing,
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
