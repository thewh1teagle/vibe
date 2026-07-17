import { emit } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { type SetStateAction, useContext, useEffect, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import type { AudioDevice } from '~/lib/audio'
import { startKeepAwake, stopKeepAwake } from '~/lib/keep-awake'
import { ensureSystemAudioPermission, ensureMicrophonePermission } from '~/lib/permissions'
import { ErrorModalContext } from '~/providers/error-modal'
import { usePreferenceProvider } from '~/providers/preference'

export function useRecording(onBeforeStart: () => void) {
	const preference = usePreferenceProvider()
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const [devices, setDevices] = useState<AudioDevice[]>([])
	const [savedInputDeviceId, setSavedInputDeviceId] = useLocalStorage<string | null>('prefs_input_device_id', null)
	const [savedOutputDeviceId, setSavedOutputDeviceId] = useLocalStorage<string | null>('prefs_output_device_id', null)
	const [inputDevice, setInputDevice] = useState<AudioDevice | null>(null)
	const [outputDevice, setOutputDevice] = useState<AudioDevice | null>(null)
	const [isRecording, setIsRecording] = useState(false)
	const [recordingName, setRecordingName] = useState('')

	function setInputDeviceAndSave(value: SetStateAction<AudioDevice | null>) {
		const device = typeof value === 'function' ? value(inputDevice) : value
		setSavedInputDeviceId(device?.id ?? '')
		setInputDevice(device)
	}

	function setOutputDeviceAndSave(value: SetStateAction<AudioDevice | null>) {
		const device = typeof value === 'function' ? value(outputDevice) : value
		setSavedOutputDeviceId(device?.id ?? '')
		setOutputDevice(device)
	}

	async function loadAudioDevices() {
		const newDevices = await invoke<AudioDevice[]>('get_audio_devices')
		const inputs = newDevices.filter((device) => device.isInput)
		const outputs = newDevices.filter((device) => !device.isInput)
		setInputDevice(savedInputDeviceId === null ? inputs.find((device) => device.isDefault) ?? null : inputs.find((device) => device.id === savedInputDeviceId) ?? null)
		setOutputDevice(savedOutputDeviceId === null ? outputs.find((device) => device.isDefault) ?? null : outputs.find((device) => device.id === savedOutputDeviceId) ?? null)
		setDevices(newDevices)
	}

	useEffect(() => {
		if (preference.homeTab === 'record') loadAudioDevices()
	}, [preference.homeTab])

	async function startRecord() {
		// Check permissions before we start so the user never talks into a
		// recording that isn't actually capturing.
		if (inputDevice && !(await ensureMicrophonePermission())) return
		if (outputDevice && !(await ensureSystemAudioPermission())) return
		startKeepAwake()
		onBeforeStart()
		setIsRecording(true)
		const selectedDevices = [inputDevice, outputDevice].filter((device): device is AudioDevice => device !== null)
		try {
			await invoke('start_record', {
				devices: selectedDevices,
				storeInDocuments: preference.storeRecordInDocuments,
				customPath: preference.customRecordingPath,
				recordingName: recordingName.trim() || null,
			})
		} catch (error) {
			stopKeepAwake()
			setIsRecording(false)
			console.error('startRecord error: ', error)
			setErrorModal?.({ log: String(error), open: true })
		}
	}

	async function stopRecord() {
		try {
			await emit('stop_record')
		} catch (error) {
			stopKeepAwake()
			setIsRecording(false)
			console.error('stopRecord error: ', error)
			setErrorModal?.({ log: String(error), open: true })
		}
	}

	return {
		devices, setDevices, inputDevice, outputDevice, isRecording, setIsRecording, recordingName, setRecordingName,
		setInputDevice: setInputDeviceAndSave, setOutputDevice: setOutputDeviceAndSave, startRecord, stopRecord,
	}
}
