import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ErrorModalContext } from '~/providers/error-modal'
import { usePreferenceProvider, type TranscriptionProvider } from '~/providers/preference'
import * as utils from '~/lib/model'
import { listModels } from '~/lib/fs'
import * as config from '~/lib/config'

export function viewModel() {
	const location = useLocation()
	const [downloadProgress, setDownloadProgress] = useState(0)
	const [isOnline, setIsOnline] = useState<boolean | null>(null)
	const [isDownloading, setIsDownloading] = useState(false)
	const [hasLocalModels, setHasLocalModels] = useState(false)
	const downloadProgressRef = useRef(0)
	const cancelledRef = useRef(false)
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const navigate = useNavigate()
	const preference = usePreferenceProvider()
	const [modelCompany, setModelCompany] = useState('OpenAI')
	const unlistenRef = useRef<(() => void) | null>(null)
	const [hasAttempted, setHasAttempted] = useState(false)
	const [groqKeyStatus, setGroqKeyStatus] = useState<'idle' | 'success' | 'failed'>('idle')

	useEffect(() => {
		listModels().then((models) => setHasLocalModels(models.length > 0))
	}, [])

	function handleProgressEvents() {
		listen('download_progress', (event) => {
			const [current, total] = event.payload as [number, number]
			const newDownloadProgress = Number(current / total) * 100

			if (newDownloadProgress > downloadProgressRef.current) {
				setDownloadProgress(newDownloadProgress)
				downloadProgressRef.current = newDownloadProgress
			}
		}).then((unlisten) => {
			unlistenRef.current = unlisten
		})
	}

	useEffect(() => {
		return () => {
			unlistenRef.current?.()
		}
	}, [])

	async function performDownload() {
		handleProgressEvents()
		setIsDownloading(true)

		try {
			let urls: string[]
			let company: string

			if (location?.state?.downloadURL) {
				urls = [location.state.downloadURL]
				company = urls[0].includes('ivrit') ? 'ivrit.ai' : 'OpenAI'
			} else {
				const preset = config.modelPresets.find((p) => p.id === preference.selectedModelPreset) ?? config.modelPresets[0]
				urls = [...preset.urls]
				company = 'OpenAI'
			}
			setModelCompany(company)

			for (const url of urls) {
				try {
					console.log(`[model] Attempting to download from: ${url}`)
					const path = await utils.downloadModel(url)
					if (cancelledRef.current) return
					if (path) {
						console.log(`[model] Download succeeded: ${path}`)
						preference.setModelPath(path)
						navigate('/')
						return
					}
				} catch (err) {
					console.error(`[model] Failed to download from ${url}:`, err)
				}
			}

			throw new Error('All model downloads failed')
		} catch (err) {
			if (!cancelledRef.current) {
				console.error(`[model] Unhandled error:`, err)
				setErrorModal?.({ open: true, log: String(err) })
				setIsDownloading(false)
			}
		}
	}

	async function startDownload() {
		setHasAttempted(true)
		setDownloadProgress(0)
		downloadProgressRef.current = 0
		const isOnlineResponse = await invoke<boolean>('is_online')
		setIsOnline(isOnlineResponse)
		if (isOnlineResponse) {
			performDownload()
		}
	}

	function goBack() {
		navigate('/')
	}

	function cancelDownload() {
		cancelledRef.current = true
		setIsDownloading(false)
		navigate('/')
	}

	function setProvider(provider: TranscriptionProvider) {
		preference.setTranscriptionProvider(provider)
		setGroqKeyStatus('idle')
	}

	async function testGroqKey() {
		if (!preference.groqApiKey) return
		try {
			const valid = await invoke<boolean>('test_groq_key', { apiKey: preference.groqApiKey })
			setGroqKeyStatus(valid ? 'success' : 'failed')
		} catch {
			setGroqKeyStatus('failed')
		}
	}

	function startWithGroq() {
		navigate('/')
	}

	function openGroqConsole() {
		openUrl(config.groqConsoleURL)
	}

	return {
		modelCompany,
		downloadProgress,
		isOnline,
		isDownloading,
		hasAttempted,
		hasLocalModels,
		presets: config.modelPresets,
		selectedPresetId: preference.selectedModelPreset,
		setSelectedPresetId: preference.setSelectedModelPreset,
		startDownload,
		goBack,
		cancelDownload,
		location,
		provider: preference.transcriptionProvider,
		setProvider,
		groqApiKey: preference.groqApiKey,
		setGroqApiKey: preference.setGroqApiKey,
		groqKeyStatus,
		testGroqKey,
		startWithGroq,
		openGroqConsole,
	}
}
