import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { isRegistered, register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { AudioDevice } from '~/lib/audio'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { usePersisted } from '~/lib/config-store'
import { getDefaultRecordingShortcut } from '~/lib/config'
import type { MeetingRecordingOptions } from '~/lib/meeting-prompt'
import { ensureSystemAudioPermission } from '~/lib/permissions'
import { m } from '~/paraglide/messages.js'
import { useHotkeyProvider } from './hotkey'

interface RecordingShortcutContextValue {
	recordingShortcutEnabled: boolean
	setRecordingShortcutEnabled: (enabled: boolean) => void
	recordingShortcut: string
	setRecordingShortcut: (shortcut: string) => void
	/** Suspend the registered shortcut while ShortcutRecorder captures a replacement. */
	setRecordingShortcutCapturing: (capturing: boolean) => void
	/** Keep the global toggle synchronized with recordings started from the regular UI. */
	setNormalRecordingActive: (active: boolean) => void
	isShortcutRecording: boolean
}

const RecordingShortcutContext = createContext<RecordingShortcutContextValue | null>(null)

export function useRecordingShortcut() {
	const context = useContext(RecordingShortcutContext)
	if (!context) throw new Error('useRecordingShortcut must be used inside <RecordingShortcutProvider>')
	return context
}

function errorDescription(error: unknown) {
	return error instanceof Error ? error.message : String(error)
}

export function RecordingShortcutProvider({ children }: { children: ReactNode }) {
	const dictation = useHotkeyProvider()
	const dictationRecordingRef = useRef(dictation.isHotkeyRecording)
	const [recordingShortcutEnabled, setRecordingShortcutEnabled] = usePersisted(CONFIG_KEYS.recordingShortcutEnabled, false)
	const [recordingShortcut, setRecordingShortcut] = usePersisted(CONFIG_KEYS.recordingShortcut, getDefaultRecordingShortcut())
	const [capturing, setCapturing] = useState(false)
	const [isShortcutRecording, setIsShortcutRecording] = useState(false)
	const recordingRef = useRef(false)
	const normalRecordingActiveRef = useRef(false)
	const startingRef = useRef(false)
	const stoppingRef = useRef(false)
	const pressedRef = useRef(false)
	const registeredRef = useRef<string | null>(null)
	const registrationQueueRef = useRef<Promise<void>>(Promise.resolve())

	useEffect(() => {
		dictationRecordingRef.current = dictation.isHotkeyRecording
	}, [dictation.isHotkeyRecording])

	const startRecording = useCallback(async (options: MeetingRecordingOptions = { microphone: true, systemAudio: false }) => {
		if (normalRecordingActiveRef.current || startingRef.current || stoppingRef.current) return false
		if (dictationRecordingRef.current) {
			toast.error(m.recordingAlreadyInProgress())
			return false
		}
		startingRef.current = true
		try {
			const devices = await invoke<AudioDevice[]>('get_audio_devices')
			const microphone = devices.find((device) => device.isDefault && device.isInput)
			const systemAudio = devices.find((device) => device.isDefault && !device.isInput)
			if (options.microphone && !microphone) throw new Error(m.noDefaultMicrophone())
			if (options.systemAudio && !systemAudio) throw new Error(m.systemAudioPermissionInfo())
			if (options.systemAudio && !(await ensureSystemAudioPermission())) return false
			const selectedDevices = [options.microphone ? microphone : null, options.systemAudio ? systemAudio : null].filter(
				(device): device is AudioDevice => device != null,
			)
			if (selectedDevices.length === 0) throw new Error(m.noDefaultMicrophone())
			await invoke('start_record', { devices: selectedDevices, recordingName: null })
			recordingRef.current = true
			normalRecordingActiveRef.current = true
			setIsShortcutRecording(true)
			return true
		} catch (error) {
			console.error('Recording shortcut failed to start:', error)
			toast.error(m.recordingShortcutStartFailed(), { description: errorDescription(error) })
			return false
		} finally {
			startingRef.current = false
		}
	}, [])

	const stopRecording = useCallback(async () => {
		if (!normalRecordingActiveRef.current || stoppingRef.current) return
		stoppingRef.current = true
		try {
			await emit('stop_record')
		} catch (error) {
			stoppingRef.current = false
			console.error('Recording shortcut failed to stop:', error)
			toast.error(m.recordingShortcutStopFailed(), { description: errorDescription(error) })
		}
	}, [])

	useEffect(() => {
		const unlisten = listen<MeetingRecordingOptions>('meeting-prompt-start-recording', async ({ payload }) => {
			const started = await startRecording(payload)
			await emit('meeting-prompt-recording-result', { started })
		})
		return () => {
			unlisten.then((dispose) => dispose())
		}
	}, [startRecording])

	useEffect(() => {
		function resetRecording() {
			normalRecordingActiveRef.current = false
			stoppingRef.current = false
			if (!recordingRef.current) return
			recordingRef.current = false
			setIsShortcutRecording(false)
		}
		const unlistenFinish = listen('record_finish', resetRecording)
		const unlistenError = listen('record_error', resetRecording)
		return () => {
			unlistenFinish.then((dispose) => dispose())
			unlistenError.then((dispose) => dispose())
		}
	}, [])

	useEffect(() => {
		let cancelled = false

		async function releaseRegisteredShortcut() {
			const registered = registeredRef.current
			if (!registered) return
			try {
				if (await isRegistered(registered)) await unregister(registered)
			} catch (error) {
				console.error('Failed to unregister recording shortcut:', error)
			} finally {
				if (registeredRef.current === registered) registeredRef.current = null
			}
		}

		async function registerShortcut() {
			pressedRef.current = false
			await releaseRegisteredShortcut()
			if (!recordingShortcutEnabled || capturing || dictation.isHotkeyRecording || !recordingShortcut || cancelled) return
			try {
				await register(recordingShortcut, (event) => {
					if (event.state === 'Released') {
						pressedRef.current = false
						return
					}
					if (pressedRef.current) return
					pressedRef.current = true
					if (normalRecordingActiveRef.current) void stopRecording()
					else void startRecording()
				})
				if (cancelled) {
					await unregister(recordingShortcut)
					return
				}
				registeredRef.current = recordingShortcut
			} catch (error) {
				console.error('Failed to register recording shortcut:', error)
				toast.error(m.recordingShortcutRegistrationFailed(), { description: errorDescription(error) })
			}
		}

		registrationQueueRef.current = registrationQueueRef.current.then(registerShortcut, registerShortcut)
		return () => {
			cancelled = true
			registrationQueueRef.current = registrationQueueRef.current.then(releaseRegisteredShortcut)
		}
	}, [capturing, dictation.isHotkeyRecording, recordingShortcut, recordingShortcutEnabled, startRecording, stopRecording])

	const setRecordingShortcutCapturing = useCallback((next: boolean) => {
		setCapturing(next)
		if (!next) return
		registrationQueueRef.current = registrationQueueRef.current.then(async () => {
			const registered = registeredRef.current
			if (!registered) return
			try {
				if (await isRegistered(registered)) await unregister(registered)
			} catch (error) {
				console.error('Failed to release recording shortcut for capture:', error)
			} finally {
				if (registeredRef.current === registered) registeredRef.current = null
			}
		})
	}, [])

	const setNormalRecordingActive = useCallback((active: boolean) => {
		normalRecordingActiveRef.current = active
	}, [])

	return (
		<RecordingShortcutContext.Provider
			value={{
				recordingShortcutEnabled,
				setRecordingShortcutEnabled,
				recordingShortcut,
				setRecordingShortcut,
				setRecordingShortcutCapturing,
				setNormalRecordingActive,
				isShortcutRecording,
			}}>
			{children}
		</RecordingShortcutContext.Provider>
	)
}
