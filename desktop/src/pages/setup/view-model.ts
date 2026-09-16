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
import { join } from '@tauri-apps/api/path'
import { installNativeModelPackage } from '~/lib/native-model'

export function viewModel() {
	const location = useLocation()
	const [downloadProgress, setDownloadProgress] = useState(0)
	const [isOnline, setIsOnline] = useState<boolean | null>(null)
	const downloadProgressRef = useRef(0)
	// StrictMode mounts the effect twice in dev; one setup visit must start one download.
	const startedRef = useRef(false)
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
		if (await utils.isModelFileUsable(vadPath)) return true

		const confirmed = await ask('This transcription model requires Silero VAD. Download it before selecting the model?', {
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

	/** A magic-install link (or a pasted catalog URL) can point at a native package component —
	 * those install as a staged multi-file directory, not a single file. */
	async function downloadNativePackage(entry: config.NativeModelDownload) {
		console.log(`[model] Installing native package from magic link: ${entry.name}`)
		const outcome = await installNativeModelPackage(entry, {
			onProgress: (percent) => {
				if (percent > downloadProgressRef.current) {
					setDownloadProgress(percent)
					downloadProgressRef.current = percent
				}
			},
		})
		if (outcome.status === 'cancelled') {
			console.log('[model] Native package download cancelled')
			return
		}
		if (outcome.status === 'failed') {
			const error = `Could not download ${entry.name}: ${outcome.error}`
			console.error(`[model] ${error}`)
			setErrorModal?.({ open: true, log: error })
			return
		}
		if (!(await selectDownloadedModel(outcome.path))) {
			navigate('/#settings', { replace: true })
			return
		}
		navigate('/', { replace: true, state: { disableBack: true } })
	}

	async function downloadModel() {
		if (startedRef.current) return
		startedRef.current = true

		// Native packages carry their own pinned integrity metadata and download as several files,
		// so a catalog URL takes a different path than the plain single-file download below.
		const nativeEntry = location?.state?.downloadURL ? config.findNativeModelDownload(location.state.downloadURL) : null
		if (nativeEntry) {
			await downloadNativePackage(nativeEntry)
			return
		}

		handleProgressEvenets()

		let lastError = null

		try {
			let urls: config.ModelDownload[] = []

			// Determine model URLs
			if (location?.state?.downloadURL) {
				// A URL the user supplied carries no size or hash, so the backend falls back to the
				// size and magic-byte checks it runs on every download.
				urls = [{ url: location.state.downloadURL }]
				console.log(`[model] Using provided model URL: ${urls[0].url}`)
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
			for (const source of urls) {
				try {
					console.log(`[model] Attempting to download from: ${source.url}`)
					// Re-downloading a corrupt model overwrites it in place instead of dropping a
					// second, randomly named copy next to the broken one.
					const path = await utils.downloadModel(source, { replacePath: location?.state?.replacePath })
					if (!path) {
						console.log('[model] Download cancelled')
						return
					}
					console.log(`[model] Download succeeded: ${path}`)
					if (!(await selectDownloadedModel(path))) {
						navigate('/#settings', { replace: true })
						return
					}
					navigate('/', { replace: true, state: { disableBack: true } })
					return
				} catch (err) {
					console.error(`[model] Failed to download from ${source.url}:`, err)
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
