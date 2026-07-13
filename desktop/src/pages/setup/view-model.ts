import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ErrorModalContext } from '~/providers/error-modal'
import { usePreferenceProvider } from '~/providers/preference'
import * as utils from '~/lib/model'
import * as osExt from '@tauri-apps/plugin-os'
import * as config from '~/lib/config'
import { ask } from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

export function viewModel() {
	const location = useLocation()
	const [downloadProgress, setDownloadProgress] = useState(0)
	const [isOnline, setIsOnline] = useState<boolean | null>(null)
	const downloadProgressRef = useRef(0)
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const navigate = useNavigate()
	const preference = usePreferenceProvider()

	function handleProgressEvenets() {
		listen('download_progress', (event) => {
			// event.event is the event name (useful if you want to use a single callback fn for multiple event types)
			// event.payload is the payload object
			const [current, total] = event.payload as [number, number]
			const newDownloadProgress = Number(current / total) * 100

			if (newDownloadProgress > downloadProgressRef.current) {
				// for some reason it jumps if not
				setDownloadProgress(newDownloadProgress)
				downloadProgressRef.current = newDownloadProgress
			}
		})
	}

	async function readModelMetadata(modelPath: string) {
		return invoke<utils.ModelMetadata>('get_model_metadata', { modelPath }).catch((error) => {
			console.warn('No specialized GGUF metadata available:', error)
			return null
		})
	}

	async function ensureRequiredVad(metadata: utils.ModelMetadata | null) {
		if (!metadata?.capabilities.requires_vad) return true
		const modelsFolder = await invoke<string>('get_models_folder')
		const vadPath = await join(modelsFolder, config.vadModelFilename)
		if (await fs.exists(vadPath)) return true

		const confirmed = await ask('Nemotron requires the Silero VAD model. Download it before selecting Nemotron?', {
			title: 'Download required VAD model',
			kind: 'info',
		})
		if (!confirmed) return false
		await invoke('download_model', { url: config.vadModelUrl, path: vadPath })
		return true
	}

	async function selectDownloadedModel(modelPath: string) {
		const metadata = await readModelMetadata(modelPath)
		if (!(await ensureRequiredVad(metadata))) return false
		preference.setModelMetadata(metadata)
		preference.setModelPath(modelPath)
		return true
	}

	async function downloadModel() {
		handleProgressEvenets()

		let lastError = null

		try {
			let urls = []

			// Determine model URLs
			if (location?.state?.downloadURL) {
				urls = [location.state.downloadURL]
				console.log(`[model] Using provided model URL: ${urls[0]}`)
			} else {
				urls = [...config.modelUrls.default]
				const locale = await osExt.locale()
				console.log(`[locale] Detected locale: ${locale}`)

				if (locale?.endsWith('-IL')) {
					console.log(`[model] Prioritizing Hebrew models`)
					urls.unshift(...config.modelUrls.hebrew)
				}
			}

			// Try downloading from each URL
			for (const url of urls) {
				try {
					console.log(`[model] Attempting to download from: ${url}`)
					const path = await utils.downloadModel(url)
					if (path) {
						console.log(`[model] Download succeeded: ${path}`)
						if (!(await selectDownloadedModel(path))) {
							navigate('/#settings', { replace: true })
							return
						}
						navigate('/', { replace: true, state: { disableBack: true } })
						return
					}
				} catch (err) {
					console.error(`[model] Failed to download from ${url}:`, err)
					lastError = err
				}
			}

			throw new Error(`All model downloads failed. Last error: ${lastError}`)
		} catch (err) {
			console.error(`[model] Unhandled error:`, err)
			setErrorModal?.({ open: true, log: String(err) })
		}
	}

	async function downloadIfOnline() {
		// Check if online
		const isOnlineResponse = await invoke<boolean>('is_online')
		// If online download model
		if (isOnlineResponse) {
			downloadModel()
		}
		// Update UI
		setIsOnline(isOnlineResponse)
	}

	async function cancelSetup() {
		// Cancel and go to settings
		preference.setSkippedSetup(true)
		emit('abort_download')
		navigate('/#settings', { replace: true, state: { disableBack: true } })
	}

	useEffect(() => {
		downloadIfOnline()
	}, [])

	return {
		navigate,
		cancelSetup,
		setErrorModal,
		downloadProgress,
		downloadIfOnline,
		setDownloadProgress,
		downloadProgressRef,
		isOnline,
		location,
	}
}
