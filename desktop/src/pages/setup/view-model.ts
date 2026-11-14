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
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { catalogDownloads, catalogFilename, defaultModelsFor, type CatalogModel } from '~/lib/model-catalog'
import { bundledHelperModel, bundledCatalog } from '~/lib/model-catalog-source'
import type { SetupState } from './state'

/** One address to try, where to save it, and the catalog model it installs, if any. */
interface Attempt {
	source: config.ModelDownload
	path?: string
	model?: CatalogModel
}

export function viewModel() {
	const location = useLocation()
	const state = (location?.state ?? {}) as SetupState
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
		if (await utils.isModelFileUsable(vadPath)) return true

		const confirmed = await ask('This transcription model requires Silero VAD. Download it before selecting the model?', {
			title: 'Download required VAD model',
			kind: 'info',
		})
		if (!confirmed) return false
		const vad = bundledHelperModel('vad')
		await invoke('download_model', { url: vad.url, path: vadPath, integrity: { size: vad.size, sha256: vad.sha256 } })
		return true
	}

	async function selectDownloadedModel(modelPath: string) {
		const metadata = await readModelMetadata(modelPath)
		if (!(await ensureRequiredVad(metadata))) return false
		preference.setModelMetadata(metadata)
		preference.setModelPath(modelPath)
		return true
	}

	/**
	 * A catalog model is saved as `<id>.<ext>` with its size and hash pinned, trying its mirrors in
	 * turn; the hashes come from the catalog bundled with the app, never from the fetched one.
	 */
	async function catalogAttempts(models: CatalogModel[]): Promise<Attempt[]> {
		const modelsFolder = await invoke<string>('get_models_folder')
		const attempts: Attempt[] = []
		for (const model of models) {
			const path = state.replacePath ?? (await join(modelsFolder, catalogFilename(model)))
			attempts.push(...catalogDownloads(model).map((source) => ({ source, path, model })))
		}
		return attempts
	}

	async function planAttempts(): Promise<Attempt[]> {
		if (state.catalogModel) {
			console.log(`[model] Installing catalog model from link: ${state.catalogModel.id}`)
			return catalogAttempts([state.catalogModel])
		}
		if (state.downloadURL) {
			// A URL the user supplied carries no size or hash, so the backend falls back to the
			// size and magic-byte checks it runs on every download.
			console.log(`[model] Using provided model URL: ${state.downloadURL}`)
			return [{ source: { url: state.downloadURL }, path: state.replacePath }]
		}
		const locale = await osExt.locale()
		console.log(`[locale] Detected locale: ${locale}`)
		return catalogAttempts(defaultModelsFor(bundledCatalog, locale))
	}

	async function downloadModel() {
		handleProgressEvenets()

		let lastError = null

		try {
			const attempts = await planAttempts()

			for (const { source, path: target, model } of attempts) {
				try {
					console.log(`[model] Attempting to download from: ${source.url}`)
					// Re-downloading a corrupt model overwrites it in place instead of dropping a
					// second, randomly named copy next to the broken one.
					const path = await utils.downloadModel(source, { replacePath: target })
					if (!path) {
						console.log('[model] Download cancelled')
						return
					}
					console.log(`[model] Download succeeded: ${path}`)
					if (model) preference.setModelDisplayNames((names) => ({ ...names, [path]: model.name }))
					if (state.select === false) {
						// An unverified file from a link is kept, but never made the active model behind the user's back.
						toast.success(m.downloadComplete())
						navigate('/#settings', { replace: true })
						return
					}
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
