import * as dialog from '@tauri-apps/plugin-dialog'
import * as process from '@tauri-apps/plugin-process'
import { DownloadEvent, Update, check as checkUpdate } from '@tauri-apps/plugin-updater'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { ErrorModalContext } from './error-modal'
import { ModifyState } from '~/lib/types'
import { invoke } from '@tauri-apps/api/core'
import { openUrl as open } from '@tauri-apps/plugin-opener'
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
		const shouldRelaunch = await dialog.ask(m.askForRelaunchBody(), {
			title: m.askForRelaunchTitle(),
			kind: 'info',
			cancelLabel: m.cancelRelaunch(),
			okLabel: m.confirmRelaunch(),
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
		await update?.download(onDownloadEvent)
		// Windows cannot replace the bundled sona.exe while it is running. Stop it
		// only after the update has downloaded so transcription remains available
		// while the (potentially long) download is in progress.
		await invoke('stop_api_server')
		await update?.install()
		setUpdating(false)
		setTotal(null)
		setPartSize(null)
		setProgress(null)
		await askForRelaunch()
		setAvailableUpdate(false)
	}

	async function updateApp() {
		const avx2Enabled = await invoke('is_avx2_enabled')

		if (!avx2Enabled) {
			await open(latestReleaseURL)
			return
		}

		const shouldUpdate = await dialog.ask(m.askForUpdateBody({ version: String(update?.version ?? '') }), {
			title: m.askForUpdateTitle(),
			kind: 'info',
			cancelLabel: m.cancelUpdate(),
			okLabel: m.confirmUpdate(),
		})
		if (shouldUpdate) {
			try {
				await downloadAndInstall()
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
