import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { useLocalStorage } from 'usehooks-ts'
import { AudioDevice } from '~/lib/audio'
import * as transcript from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/preference'
import { useTranslation } from 'react-i18next'

const DEFAULT_HOTKEY_SHORTCUT = 'CmdOrCtrl+Shift+V'

export type HotkeyOutputMode = 'clipboard' | 'type'

interface HotkeyContextType {
	hotkeyEnabled: boolean
	setHotkeyEnabled: (enabled: boolean) => void
	hotkeyShortcut: string
	setHotkeyShortcut: (shortcut: string) => void
	hotkeyOutputMode: HotkeyOutputMode
	setHotkeyOutputMode: (mode: HotkeyOutputMode) => void
	isHotkeyRecording: boolean
	isFixTextProcessing: boolean
}

const HotkeyContext = createContext<HotkeyContextType | null>(null)

export function useHotkeyProvider() {
	const ctx = useContext(HotkeyContext)
	if (!ctx) throw new Error('useHotkeyProvider must be used within HotkeyProvider')
	return ctx
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

	const [hotkeyEnabled, setHotkeyEnabled] = useLocalStorage('prefs_hotkey_enabled', true)
	const [hotkeyShortcut, setHotkeyShortcut] = useLocalStorage('prefs_hotkey_shortcut', DEFAULT_HOTKEY_SHORTCUT)
	const [hotkeyOutputMode, setHotkeyOutputMode] = useLocalStorage<HotkeyOutputMode>('prefs_hotkey_output_mode', 'clipboard')
	const [isHotkeyRecording, setIsHotkeyRecording] = useState(false)
	const [isFixTextProcessing, setIsFixTextProcessing] = useState(false)

	const isHotkeyRecordingRef = useRef(false)
	const isFixTextProcessingRef = useRef(false)
	const lastFixTextCallRef = useRef(0)
	const lastFixTextOutputRef = useRef('')
	const hotkeyOutputModeRef = useRef(hotkeyOutputMode)
	const registeredShortcutRef = useRef<string | null>(null)
	const registeredFixShortcutRef = useRef<string | null>(null)

	useEffect(() => {
		preferenceRef.current = preference
	}, [preference])

	useEffect(() => {
		hotkeyOutputModeRef.current = hotkeyOutputMode
	}, [hotkeyOutputMode])

	const handleHotkeyDown = useCallback(async () => {
		if (isHotkeyRecordingRef.current) return
		if (isFixTextProcessingRef.current) return
		try {
			const devices = await invoke<AudioDevice[]>('get_audio_devices')
			const defaultInput = devices.find((d) => d.isDefault && d.isInput)
			if (!defaultInput) {
				console.error('No default input device found')
				await notify('Vibe — No microphone', 'Connect a microphone and try again.')
				return
			}

			isHotkeyRecordingRef.current = true
			setIsHotkeyRecording(true)

			await invoke('start_record', {
				devices: [defaultInput],
				storeInDocuments: false,
				customPath: null,
			})
		} catch (error) {
			console.error('Hotkey start_record error:', error)
			isHotkeyRecordingRef.current = false
			setIsHotkeyRecording(false)
			await notify('Vibe — Recording failed', String(error))
		}
	}, [])

	const handleHotkeyUp = useCallback(async () => {
		if (!isHotkeyRecordingRef.current) return
		await emit('stop_record')
	}, [])

	const handleFixText = useCallback(async () => {
		const now = Date.now()
		if (now - lastFixTextCallRef.current < 1000) return
		lastFixTextCallRef.current = now
		if (isFixTextProcessingRef.current) return
		if (isHotkeyRecordingRef.current) return
		const pref = preferenceRef.current
		if (!pref.fixTextEnabled) return
		if (!pref.groqApiKey) {
			await notify('Vibe — Fix text', 'Groq API key is required. Set it in settings.')
			return
		}

		isFixTextProcessingRef.current = true
		setIsFixTextProcessing(true)
		try {
			await new Promise((r) => setTimeout(r, 150))
			let clipText = await clipboard.readText()

			// If clipboard still has our last output, wait a bit and retry
			if (clipText && clipText === lastFixTextOutputRef.current) {
				await new Promise((r) => setTimeout(r, 200))
				clipText = await clipboard.readText()
			}

			console.log('[fix-text] input:', JSON.stringify(clipText?.slice(0, 80)))
			if (!clipText || !clipText.trim()) {
				await notify('Vibe — Fix text', 'Clipboard is empty. Copy some text first.')
				return
			}

			if (clipText === lastFixTextOutputRef.current) {
				await notify('Vibe — Fix text', 'Clipboard unchanged. Copy new text first.')
				return
			}

			const fixed = await invoke<string>('fix_text', { text: clipText, mode: pref.fixTextMode, apiKey: pref.groqApiKey })
			console.log('[fix-text] output:', JSON.stringify(fixed?.slice(0, 80)))
			if (fixed) {
				lastFixTextOutputRef.current = fixed
				await clipboard.writeText(fixed)
				await notify('Vibe — Text fixed', 'Corrected text copied to clipboard.')
			}
		} catch (e) {
			console.error('fix_text failed:', e)
			await notify('Vibe — Fix text failed', 'Check your Groq API key or rate limits.')
		} finally {
			isFixTextProcessingRef.current = false
			setIsFixTextProcessing(false)
		}
	}, [])

	// Listen for record_finish and process when hotkey-triggered
	useEffect(() => {
		const unlisten = listen<{ path: string; name: string }>('record_finish', async (event) => {
			if (!isHotkeyRecordingRef.current) return
			const { path } = event.payload
			try {
				await processTranscription(path)
			} catch (error) {
				console.error('Hotkey transcription error:', error)
				await notify('Vibe', String(error))
			} finally {
				isHotkeyRecordingRef.current = false
				setIsHotkeyRecording(false)
			}
		})

		return () => {
			unlisten.then((fn) => fn())
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [t])

	async function processTranscription(path: string) {
		const pref = preferenceRef.current
		const isGroq = pref.transcriptionProvider === 'groq'

		if (isGroq) {
			if (!pref.groqApiKey) {
				throw new Error('Groq API key is required')
			}
		} else {
			const modelPath = pref.modelPath
			if (!modelPath) {
				throw new Error('No model selected')
			}
			await invoke('load_model', { modelPath, gpuDevice: pref.gpuDevice })
		}

		const options = {
			path,
			...pref.modelOptions,
			provider: pref.transcriptionProvider,
			...(isGroq ? { groq_api_key: pref.groqApiKey } : {}),
		}
		const res: transcript.Transcript = await invoke('transcribe', { options })
		let resultText = transcript.asText(res.segments, t('common.speaker-prefix'), pref.rawOutput).trim()

		if (isGroq && pref.llmCleanup) {
			try {
				const cleaned = await invoke<string>('cleanup_transcript', { text: resultText, lang: pref.modelOptions.lang, apiKey: pref.groqApiKey })
				if (cleaned) resultText = cleaned
			} catch (e) {
				console.error('cleanup_transcript failed, using raw text:', e)
				await notify('Vibe — AI cleanup failed', 'Using raw transcript. Check your Groq API key or rate limits.')
			}
		}

		if (hotkeyOutputModeRef.current === 'type') {
			try {
				await invoke('type_text', { text: resultText })
			} catch (e) {
				console.error('type_text failed, falling back to clipboard:', e)
				await clipboard.writeText(resultText)
				await notify('Vibe — Typing failed, copied to clipboard', String(e))
			}
		} else {
			try {
				await clipboard.writeText(resultText)
				await notify('Vibe', t('common.hotkey-transcription-copied'))
			} catch (e) {
				console.error('clipboard write failed:', e)
				await notify('Vibe — Clipboard failed', String(e))
			}
		}
	}

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

			try {
				await register(hotkeyShortcut, (event) => {
					if (event.state === 'Pressed') {
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
	}, [hotkeyEnabled, hotkeyShortcut, handleHotkeyDown, handleHotkeyUp])

	// Register/unregister fix-text shortcut
	useEffect(() => {
		let cancelled = false
		const shortcut = preference.fixTextShortcut

		async function setupFixShortcut() {
			if (registeredFixShortcutRef.current) {
				try {
					if (await isRegistered(registeredFixShortcutRef.current)) {
						await unregister(registeredFixShortcutRef.current)
					}
				} catch (e) {
					console.error('Failed to unregister fix shortcut:', e)
				}
				registeredFixShortcutRef.current = null
			}

			if (!preference.fixTextEnabled || !shortcut || !preference.groqApiKey || cancelled) return

			try {
				await register(shortcut, (event) => {
					if (event.state === 'Pressed') {
						handleFixText()
					}
				})
				registeredFixShortcutRef.current = shortcut
			} catch (e) {
				console.error('Failed to register fix shortcut:', e)
			}
		}

		setupFixShortcut()

		return () => {
			cancelled = true
			if (registeredFixShortcutRef.current) {
				unregister(registeredFixShortcutRef.current).catch(console.error)
				registeredFixShortcutRef.current = null
			}
		}
	}, [preference.fixTextEnabled, preference.fixTextShortcut, preference.groqApiKey, handleFixText])

	const value: HotkeyContextType = useMemo(
		() => ({
			hotkeyEnabled,
			setHotkeyEnabled,
			hotkeyShortcut,
			setHotkeyShortcut,
			hotkeyOutputMode,
			setHotkeyOutputMode,
			isHotkeyRecording,
			isFixTextProcessing,
		}),
		[hotkeyEnabled, setHotkeyEnabled, hotkeyShortcut, setHotkeyShortcut, hotkeyOutputMode, setHotkeyOutputMode, isHotkeyRecording, isFixTextProcessing],
	)

	return <HotkeyContext.Provider value={value}>{children}</HotkeyContext.Provider>
}
