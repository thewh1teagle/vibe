import * as dialog from '@tauri-apps/plugin-dialog'
import * as process from '@tauri-apps/plugin-process'
import { DownloadEvent, Update, check as checkUpdate } from '@tauri-apps/plugin-updater'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorModalContext } from './ErrorModal'
import { ModifyState } from '~/lib/utils'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'
import { latestReleaseURL } from '~/lib/config'
// Define the context type

type UpdaterContextType = {
	availableUpdate: boolean
	setAvailableUpdate: ModifyState<boolean>
	updating: boolean
	setUpdating: ModifyState<boolean>
	manifest?: Update
	setManifest: ModifyState<Update | undefined>
	updateApp: () => Promise<void>
	progress: number | null
}

// Create the context
export const UpdaterContext = createContext<UpdaterContextType>({
	availableUpdate: false,
	setAvailableUpdate: () => {},
	updating: false,
	setUpdating: () => {},
	setManifest: () => {},
	updateApp: async () => {},
	progress: null,
})

export function UpdaterProvider({ children }: { children: React.ReactNode }) {
	const [availableUpdate, setAvailableUpdate] = useState(false)
	const [update, setUpdate] = useState<Update | undefined>()
	const [updating, setUpdating] = useState(false)
	const [totalSize, setTotal] = useState<number | null>(null)
	const [partSize, setPartSize] = useState<number | null>(null)
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const { t } = useTranslation()
	const [progress, setProgress] = useState<number | null>(null)

	useEffect(() => {
		if (partSize && totalSize) {
			setProgress((partSize / totalSize) * 100)
		}
	}, [partSize])

	useEffect(() => {
		// Check for new updates
		async function checkForUpdates() {
			try {
				const newUpdate = await checkUpdate()
				if (newUpdate) {
					setAvailableUpdate(newUpdate?.available)
					setUpdate(newUpdate)
				}
			} catch (error) {
				console.error(error)
			}
		}
		checkForUpdates()
	}, [])

	async function askForRelaunch() {
		const shouldRelaunch = await dialog.ask(t('common.ask-for-relaunch-body'), {
			title: t('common.ask-for-relaunch-title'),
			kind: 'info',
			cancelLabel: t('common.cancel-relaunch'),
			okLabel: t('common.confirm-relaunch'),
		})
		if (shouldRelaunch) {
			console.info('relaunch....')
			await process.relaunch()
		}
	}

	function onDownloadEvent(downloadEvent: DownloadEvent) {
		switch (downloadEvent.event) {
			case 'Started': {
				setTotal(downloadEvent.data.contentLength!)
				break
			}
			case 'Progress': {
				setPartSize((prev) => (prev ?? 0) + downloadEvent.data.chunkLength)
				break
			}
		}
	}

	async function downloadAndInstall() {
		setUpdating(true)
		setProgress(0)
		console.info(`Installing update ${update?.version}, ${update?.date}, ${update?.body}`)
		await update?.downloadAndInstall(onDownloadEvent)
		setUpdating(false)
		setTotal(null)
		setPartSize(null)
		setProgress(null)
		await askForRelaunch()
		setAvailableUpdate(false)
	}

	async function updateApp() {
		const cudaVersion = await invoke('get_cuda_version')
		const rocmVersion = await invoke('get_rocm_version')
		const avx2Enabled = await invoke('is_avx2_enabled')
		const isPortable = await invoke<string>('is_portable')

		// Nvidia / Older CPU / Portabl - No updates available
		if (cudaVersion || !avx2Enabled || isPortable || rocmVersion) {
			await open(latestReleaseURL)
			return
		}

		const shouldUpdate = await dialog.ask(t('common.ask-for-update-body', { version: update?.version }), {
			title: t('common.ask-for-update-title'),
			kind: 'info',
			cancelLabel: t('common.cancel-update'),
			okLabel: t('common.confirm-update'),
		})
		if (shouldUpdate) {
			try {
				downloadAndInstall()
			} catch (e) {
				console.error(e)
				setUpdating(false)
				setErrorModal?.({ open: true, log: String(e) })
			}
		}
	}

	return (
		<UpdaterContext.Provider
			value={{ availableUpdate, setAvailableUpdate, manifest: update, setManifest: setUpdate, updating, setUpdating, updateApp, progress }}>
			{children}
		</UpdaterContext.Provider>
	)
}
