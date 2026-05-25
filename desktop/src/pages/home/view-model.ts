import '@fontsource/roboto'
import { event } from '@tauri-apps/api'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { SetStateAction, useContext, useEffect, useRef, useState } from 'react'
import { path } from '@tauri-apps/api'
import { toast as hotToast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useLocalStorage } from 'usehooks-ts'
import successSound from '~/assets/success.mp3'
import { AudioDevice } from '~/lib/audio'
import { ensureSystemAudioPermission } from '~/lib/permissions'
import { ls } from '~/lib/fs'
import * as transcriptLib from '~/lib/transcript'
import { isUserError } from '~/lib/sona-errors'
import { startKeepAwake, stopKeepAwake } from '~/lib/keep-awake'
import { ErrorModalContext } from '~/providers/error-modal'
import { usePreferenceProvider } from '~/providers/preference'
import { hotkeyRecordingActive } from '~/providers/hotkey'

export function viewModel() {
	const navigate = useNavigate()
	const [loading, setLoading] = useState(false)
	const [isRecording, setIsRecording] = useState(false)
	const abortRef = useRef<boolean>(false)
	const [isAborting, setIsAborting] = useState(false)
	const { t } = useTranslation()

	const preference = usePreferenceProvider()
	const preferenceRef = useRef(preference)
	const [devices, setDevices] = useState<AudioDevice[]>([])
	const [savedInputDeviceId, setSavedInputDeviceId] = useLocalStorage<string | null>('prefs_input_device_id', null)
	const [savedOutputDeviceId, setSavedOutputDeviceId] = useLocalStorage<string | null>('prefs_output_device_id', null)
	const [inputDevice, setInputDevice] = useState<AudioDevice | null>(null)
	const [outputDevice, setOutputDevice] = useState<AudioDevice | null>(null)

	const { setState: setErrorModal } = useContext(ErrorModalContext)

	async function checkIfCrashedRecently() {
		try {
			const isCrashed = await invoke<boolean>('is_crashed_recently')
			if (isCrashed) {
				dialog.message(t('common.crashed-recently'))
				await invoke('rename_crash_file')
			}
		} catch {
			// ignore if command doesn't exist
		}
	}

	useEffect(() => {
		checkIfCrashedRecently()
	}, [])

	useEffect(() => {
		preferenceRef.current = preference
	}, [preference])

	function setupEventListeners(): (() => void) {
		const unlisteners: Promise<() => void>[] = []

		unlisteners.push(
			listen<{ path: string; name: string }>('record_finish', (event) => {
				if (hotkeyRecordingActive) return
				const { path } = event.payload
				setIsRecording(false)
				transcribe(path)
			})
		)

		return () => {
			unlisteners.forEach((p) => p.then((fn) => fn()))
		}
	}

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
		let newDevices = await invoke<AudioDevice[]>('get_audio_devices')
		const inputs = newDevices.filter((d) => d.isInput)
		const outputs = newDevices.filter((d) => !d.isInput)
		const restoredInput = savedInputDeviceId === null
			? inputs.find((d) => d.isDefault) ?? null
			: inputs.find((d) => d.id === savedInputDeviceId) ?? null
		const restoredOutput = savedOutputDeviceId === null
			? outputs.find((d) => d.isDefault) ?? null
			: outputs.find((d) => d.id === savedOutputDeviceId) ?? null
		setInputDevice(restoredInput)
		setOutputDevice(restoredOutput)
		setDevices(newDevices)
	}

	async function onAbort() {
		setIsAborting(true)
		abortRef.current = true
		event.emit('abort_transcribe')
	}

	async function checkModelExists() {
		try {
			const configPath = await invoke<string>('get_models_folder')
			const entries = await ls(configPath)
			const filtered = entries.filter((e) => e.name?.endsWith('.bin'))
			if (filtered.length === 0) {
				if (!preference.skippedSetup) {
					navigate('/setup')
				}
			} else {
				if (!preference.modelPath || !(await fs.exists(preference.modelPath))) {
					const absPath = await path.join(configPath, filtered[0].name)
					preference.setModelPath(absPath)
				}
			}
		} catch {
			navigate('/setup')
		}
	}

	useEffect(() => {
		let cleanup: (() => void) | undefined

		async function Init() {
			cleanup = setupEventListeners()
			checkModelExists()
		}

		Init()

		return () => {
			cleanup?.()
		}
	}, [])

	useEffect(() => {
		loadAudioDevices()
	}, [])

	async function startRecord() {
		if (outputDevice) {
			const permitted = await ensureSystemAudioPermission()
			if (!permitted) {
				return
			}
		}

		startKeepAwake()

		setIsRecording(true)
		let devices: AudioDevice[] = []
		if (inputDevice) {
			devices.push(inputDevice)
		}
		if (outputDevice) {
			devices.push(outputDevice)
		}
		try {
			await invoke('start_record', { devices, storeInDocuments: preference.storeRecordInDocuments, customPath: preference.customRecordingPath })
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

	async function transcribe(path: string) {
		startKeepAwake()

		setLoading(true)
		abortRef.current = false

		try {
			const modelPath = preferenceRef.current.modelPath
			if (!modelPath) {
				throw new Error('No model selected. Please download or select a model first.')
			}
			const loadResult = await invoke<string>('load_model', { modelPath, gpuDevice: preferenceRef.current.gpuDevice })
			if (loadResult === 'gpu_fallback') {
				hotToast.warning(t('common.gpu-fallback-to-cpu'), { position: 'bottom-center', duration: 8000 })
			}
			const options = {
				path,
				...preferenceRef.current.modelOptions,
			}
			const startTime = performance.now()
			await invoke<transcriptLib.Transcript>('transcribe', {
				options,
			})

			const total = Math.round((performance.now() - startTime) / 1000)
			console.info(`Transcribe took ${total} seconds.`)

			hotToast.success(t('common.transcribe-took', { total: String(total) }), { position: 'bottom-center' })
		} catch (error) {
			if (!abortRef.current) {
				console.error('error: ', error)

				const errorObj = typeof error === 'object' && error !== null ? (error as any) : null
				const errorCode = errorObj?.code
				const errorMessage = errorObj?.message || String(error)

				if (errorCode && isUserError(errorCode)) {
					hotToast.error(`${t('common.error')}: ${errorMessage}`, { position: 'bottom-center' })
				} else {
					setErrorModal?.({ log: errorMessage, open: true })
				}
			}
		} finally {
			stopKeepAwake()
			setLoading(false)
			setIsAborting(false)
			if (!abortRef.current) {
				if (preferenceRef.current.soundOnFinish) {
					new Audio(successSound).play()
				}
				if (preferenceRef.current.focusOnFinish) {
					webview.getCurrentWebviewWindow().unminimize()
					webview.getCurrentWebviewWindow().setFocus()
				}
			}
		}
	}

	return {
		devices,
		inputDevice,
		setInputDevice: setInputDeviceAndSave,
		outputDevice,
		setOutputDevice: setOutputDeviceAndSave,
		isRecording,
		setIsRecording,
		startRecord,
		stopRecord,
		preference,
		isAborting,
		loading,
		transcribe,
		onAbort,
	}
}
