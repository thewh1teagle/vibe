import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorModalContext } from '~/providers/ErrorModal'
import { usePreferencesContext } from '~/providers/Preferences'

export function viewModel() {
	const [downloadProgress, setDownloadProgress] = useState(0)
	const [isOnline, setIsOnline] = useState<boolean | null>(null)
	const downloadProgressRef = useRef(0)
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const navigate = useNavigate()
	const preferences = usePreferencesContext()

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

	async function downloadModel() {
		handleProgressEvenets()
		try {
			const path = await invoke('download_model')
			preferences.setModelPath(path as string)
			navigate('/')
		} catch (error) {
			console.error(error)
			setErrorModal?.({ open: true, log: String(error) })
		}
	}

	async function downloadIfOnline() {
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
		preferences.setSkippedSetup(true)
		emit('abort_download')
		navigate('/#settings')
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
	}
}
