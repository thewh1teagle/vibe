import { listen } from '@tauri-apps/api/event'
import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorModalContext } from '../../providers/ErrorModalProvider'
import { invoke } from '@tauri-apps/api/core'
import { useLocalStorage } from 'usehooks-ts'

export function useSetupViewModel() {
    const [downloadProgress, setDownloadProgress] = useState(0)
    const downloadProgressRef = useRef(0)
    const { setState: setErrorModal } = useContext(ErrorModalContext)
    const navigate = useNavigate()
    const [_modelPath, setModelPath] = useLocalStorage<null | string>('model_path', null)

    async function downloadModel() {
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
        try {
            const path = await invoke('download_model')
            setModelPath(path as string)
            navigate('/')
        } catch (e: any) {
            console.error(e)
            setErrorModal?.({ open: true, log: e?.toString() })
        }
    }

    useEffect(() => {
        downloadModel()
    }, [])

    return {
        setErrorModal,
        downloadProgress,
        setDownloadProgress,
        downloadProgressRef,
    }
}
