import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalStorage } from 'usehooks-ts'
import { ErrorModalContext } from '~/providers/ErrorModal'

export function viewModel() {
	const [downloadProgress, setDownloadProgress] = useState(0)
	const [isOnline, setIsOnline] = useState<boolean | null>(false)
	const [_manualInstall, setManualInstall] = useLocalStorage('isManualInstall', false)
	const downloadProgressRef = useRef(0)
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const navigate = useNavigate()
	const [_modelPath, setModelPath] = useLocalStorage<null | string>('model_path', null)

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
			setModelPath(path as string)
			navigate('/')
		} catch (error) {
			console.error(error)
			setErrorModal?.({ open: true, log: String(error) })
		}
	}

	async function downloadIfOnline() {
		const isOnlineResponse = (await invoke('is_online')) as boolean
		// If online download model
		if (isOnlineResponse) {
			downloadModel()
		}
		// Update UI
		setIsOnline(isOnlineResponse)
	}

	async function cancelSetup() {
		// Cancel and go to settings
		setManualInstall(true)
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
