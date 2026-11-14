import { emit } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { type SetStateAction, useContext, useEffect, useState } from 'react'
import { resolveSavedDevice, warnDeviceFallback, type AudioDevice, type StartRecordOutcome } from '~/lib/audio'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { usePersisted } from '~/lib/config-store'
import { KEEP_AWAKE, startKeepAwake, stopKeepAwake } from '~/lib/keep-awake'
import { ensureSystemAudioPermission } from '~/lib/permissions'
import { ErrorModalContext } from '~/providers/error-modal'
import { usePreferenceProvider } from '~/providers/preference'

export function useRecording(onBeforeStart: () => void) {
	const preference = usePreferenceProvider()
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const [devices, setDevices] = useState<AudioDevice[]>([])
	const [savedInputDeviceId, setSavedInputDeviceId] = usePersisted<string | null>(CONFIG_KEYS.inputDeviceId, null)
	const [savedOutputDeviceId, setSavedOutputDeviceId] = usePersisted<string | null>(CONFIG_KEYS.outputDeviceId, null)
	const [savedInputDeviceName, setSavedInputDeviceName] = usePersisted<string | null>(CONFIG_KEYS.inputDeviceName, null)
	const [savedOutputDeviceName, setSavedOutputDeviceName] = usePersisted<string | null>(CONFIG_KEYS.outputDeviceName, null)
	const [inputDevice, setInputDevice] = useState<AudioDevice | null>(null)
	const [outputDevice, setOutputDevice] = useState<AudioDevice | null>(null)
	const [isRecording, setIsRecording] = useState(false)
	const [recordingName, setRecordingName] = useState('')

	function setInputDeviceAndSave(value: SetStateAction<AudioDevice | null>) {
		const device = typeof value === 'function' ? value(inputDevice) : value
		setSavedInputDeviceId(device?.id ?? '')
		setSavedInputDeviceName(device?.name ?? null)
		setInputDevice(device)
	}

	function setOutputDeviceAndSave(value: SetStateAction<AudioDevice | null>) {
		const device = typeof value === 'function' ? value(outputDevice) : value
		setSavedOutputDeviceId(device?.id ?? '')
		setSavedOutputDeviceName(device?.name ?? null)
		setOutputDevice(device)
	}

	async function loadAudioDevices() {
		const newDevices = await invoke<AudioDevice[]>('get_audio_devices')
		// A saved device that is not connected shows the default in its place, with a warning. The
		// saved choice itself is left alone, so the device comes back once it reconnects.
		const input = resolveSavedDevice(newDevices, true, savedInputDeviceId)
		const output = resolveSavedDevice(newDevices, false, savedOutputDeviceId)
		if (input.missing) warnDeviceFallback(savedInputDeviceName ?? String(savedInputDeviceId), input.device?.name ?? null, `in:${savedInputDeviceId}`)
		if (output.missing) warnDeviceFallback(savedOutputDeviceName ?? String(savedOutputDeviceId), output.device?.name ?? null, `out:${savedOutputDeviceId}`)
		setInputDevice(input.device)
		setOutputDevice(output.device)
		setDevices(newDevices)
	}

	useEffect(() => {
		if (preference.homeTab === 'record') loadAudioDevices()
	}, [preference.homeTab])

	async function startRecord() {
		if (outputDevice && !(await ensureSystemAudioPermission())) return
		startKeepAwake(KEEP_AWAKE.record)
		onBeforeStart()
		setIsRecording(true)
		const selectedDevices = [inputDevice, outputDevice].filter((device): device is AudioDevice => device !== null)
		try {
			const outcome = await invoke<StartRecordOutcome | null>('start_record', {
				devices: selectedDevices,
				recordingName: recordingName.trim() || null,
			})
			// Unplugged between loading the list and pressing record: Rust recorded from the default.
			for (const fallback of outcome?.deviceFallbacks ?? []) warnDeviceFallback(fallback.requested, fallback.used)
		} catch (error) {
			stopKeepAwake(KEEP_AWAKE.record)
			setIsRecording(false)
			console.error('startRecord error: ', error)
			setErrorModal?.({ log: String(error), open: true })
		}
	}

	async function stopRecord() {
		try {
			await emit('stop_record')
		} catch (error) {
			stopKeepAwake(KEEP_AWAKE.record)
			setIsRecording(false)
			console.error('stopRecord error: ', error)
			setErrorModal?.({ log: String(error), open: true })
		}
	}

	return {
		devices,
		setDevices,
		inputDevice,
		outputDevice,
		isRecording,
		setIsRecording,
		recordingName,
		setRecordingName,
		setInputDevice: setInputDeviceAndSave,
		setOutputDevice: setOutputDeviceAndSave,
		startRecord,
		stopRecord,
	}
}
