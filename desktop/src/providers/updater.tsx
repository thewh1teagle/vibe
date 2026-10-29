import * as dialog from '@tauri-apps/plugin-dialog'
import * as process from '@tauri-apps/plugin-process'
import { listen } from '@tauri-apps/api/event'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { ErrorModalContext } from './error-modal'
import { ModifyState } from '~/lib/types'
import { invoke } from '@tauri-apps/api/core'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { usePersisted } from '~/lib/config-store'
// Define the context type

/** Dev-only: pretend an update is waiting so the update affordances can be eyeballed. */
export const FAKE_UPDATE_KEY = 'vibe_fake_update'
export const devToolsEnabled = import.meta.env.DEV

/** Which `updater/<channel>.json` the app follows. See docs/UPDATER.md. */
export type UpdateChannel = 'stable' | 'beta'

/** A newer version `update_check` found on the channel. */
export interface Update {
	version: string
	currentVersion: string
	body?: string
}

interface DownloadProgress {
	chunk: number
	total: number | null
}

type UpdaterContextType = {
	availableUpdate: boolean
	setAvailableUpdate: ModifyState<boolean>
	updating: boolean
	setUpdating: ModifyState<boolean>
	manifest?: Update
	setManifest: ModifyState<Update | undefined>
	updateApp: () => Promise<void>
	progress: number | null
	/** Dev-only switch that fakes `availableUpdate`; always false in release builds. */
	fakeUpdate: boolean
	setFakeUpdate: (value: boolean) => void
	channel: UpdateChannel
	setChannel: (value: UpdateChannel) => void
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
	fakeUpdate: false,
	setFakeUpdate: () => {},
	channel: 'stable',
	setChannel: () => {},
})

export function UpdaterProvider({ children }: { children: React.ReactNode }) {
	const [availableUpdate, setAvailableUpdate] = useState(false)
	const [update, setUpdate] = useState<Update | undefined>()
	const [updating, setUpdating] = useState(false)
	const [totalSize, setTotal] = useState<number | null>(null)
	const [partSize, setPartSize] = useState<number | null>(null)
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const [progress, setProgress] = useState<number | null>(null)
	const [channel, setChannel] = usePersisted<UpdateChannel>(CONFIG_KEYS.updateChannel, 'stable')
	const [fakeUpdate, setFakeUpdateState] = useState(() => {
		if (!devToolsEnabled) return false
		try {
			return localStorage.getItem(FAKE_UPDATE_KEY) === '1'
		} catch {
			return false
		}
	})

	function setFakeUpdate(value: boolean) {
		setFakeUpdateState(value)
		try {
			localStorage.setItem(FAKE_UPDATE_KEY, value ? '1' : '0')
		} catch {
			/* private mode — the flag still holds for this session */
		}
	}

	useEffect(() => {
		if (partSize && totalSize) {
			setProgress((partSize / totalSize) * 100)
		}
	}, [partSize])

	// Checked again on a channel switch, so moving to beta offers its build right away.
	useEffect(() => {
		let cancelled = false
		invoke<Update | null>('update_check', { channel })
			.then((found) => {
				if (cancelled) return
				setAvailableUpdate(found !== null)
				setUpdate(found ?? undefined)
			})
			.catch((error) => console.error(error))
		return () => {
			cancelled = true
		}
	}, [channel])

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

	async function downloadAndInstall() {
		setUpdating(true)
		setProgress(0)
		console.info(`Installing update ${update?.version}, ${update?.body}`)
		const unlisten = await listen<DownloadProgress>('updater-progress', ({ payload }) => {
			if (payload.total) setTotal(payload.total)
			setPartSize((prev) => (prev ?? 0) + payload.chunk)
		})
		try {
			await invoke('update_download')
		} finally {
			unlisten()
		}
		// Windows cannot replace the bundled server.exe while it is running. Stop it
		// only after the update has downloaded so transcription remains available
		// while the (potentially long) download is in progress.
		await invoke('stop_api_server')
		await invoke('update_install')
		setUpdating(false)
		setTotal(null)
		setPartSize(null)
		setProgress(null)
		await askForRelaunch()
		setAvailableUpdate(false)
	}

	async function updateApp() {
		if (fakeUpdate && !update) {
			await dialog.message('This is a faked update (dev mode). No download will happen.', { title: m.updateVersion(), kind: 'info' })
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
			value={{
				availableUpdate: availableUpdate || fakeUpdate,
				setAvailableUpdate,
				fakeUpdate,
				setFakeUpdate,
				channel,
				setChannel,
				manifest: update,
				setManifest: setUpdate,
				updating,
				setUpdating,
				updateApp,
				progress,
			}}>
			{children}
		</UpdaterContext.Provider>
	)
}
