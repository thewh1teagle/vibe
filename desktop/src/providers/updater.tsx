import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import * as dialog from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { changelogURL } from '~/lib/config'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { usePersisted, writeConfigNow } from '~/lib/config-store'
import { hasAvailableUpdate, initialUpdateState, type UpdateChannel, type UpdateNotice, type UpdateState } from '~/lib/updater'
import { m } from '~/paraglide/messages.js'
import { ErrorModalContext } from './error-modal'

export type { UpdateChannel, UpdateState } from '~/lib/updater'

/** Dev-only: pretend an update is waiting so the update affordances can be eyeballed. */
export const FAKE_UPDATE_KEY = 'vibe_fake_update'
export const devToolsEnabled = import.meta.env.DEV

type UpdaterContextType = {
	/** Rust's view of the update lifecycle, kept live by the `update-state` event. */
	state: UpdateState
	/** A newer version is known and not installed yet (or the dev fake flag is on). */
	availableUpdate: boolean
	/** Confirm, then install now; the app relaunches itself when it succeeds. */
	updateApp: () => Promise<void>
	checkNow: () => Promise<void>
	channel: UpdateChannel
	setChannel: (value: UpdateChannel) => Promise<void>
	/** Install now without asking: for the reminder banner, which is itself the question. */
	installNow: () => Promise<void>
	/** Snooze the reminder banner for 5 days. */
	remindLater: () => Promise<void>
	autoUpdate: boolean
	setAutoUpdate: (value: boolean) => Promise<void>
	/** Dev-only switch that fakes `availableUpdate`; always false in release builds. */
	fakeUpdate: boolean
	setFakeUpdate: (value: boolean) => void
}

export const UpdaterContext = createContext<UpdaterContextType>({
	state: initialUpdateState,
	availableUpdate: false,
	updateApp: async () => {},
	checkNow: async () => {},
	channel: 'stable',
	setChannel: async () => {},
	installNow: async () => {},
	remindLater: async () => {},
	autoUpdate: true,
	setAutoUpdate: async () => {},
	fakeUpdate: false,
	setFakeUpdate: () => {},
})

function readFakeUpdate() {
	if (!devToolsEnabled) return false
	try {
		return localStorage.getItem(FAKE_UPDATE_KEY) === '1'
	} catch {
		return false
	}
}

export function UpdaterProvider({ children }: { children: React.ReactNode }) {
	const [state, setState] = useState<UpdateState>(initialUpdateState)
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const [channel] = usePersisted<UpdateChannel>(CONFIG_KEYS.updateChannel, 'stable')
	const [autoUpdate] = usePersisted<boolean>(CONFIG_KEYS.autoUpdate, true)
	const [fakeUpdate, setFakeUpdateState] = useState(readFakeUpdate)

	useEffect(() => {
		let cancelled = false
		const unlisten = listen<UpdateState>('update-state', ({ payload }) => setState(payload))
		invoke<UpdateState>('update_state')
			.then((current) => {
				if (!cancelled) setState(current)
			})
			.catch((error) => console.error('failed to read update state', error))
		return () => {
			cancelled = true
			void unlisten.then((stop) => stop())
		}
	}, [])

	// Non-null only once, on the first launch after an update — so no cancel guard:
	// a StrictMode remount must not swallow the one answer that carries it.
	useEffect(() => {
		invoke<UpdateNotice | null>('update_take_notice')
			.then((notice) => {
				if (!notice) return
				toast.success(m.updatedTo({ version: notice.to }), {
					action: { label: m.whatsNew(), onClick: () => void openUrl(changelogURL(notice.to)) },
				})
			})
			.catch((error) => console.error('failed to read update notice', error))
	}, [])

	async function checkNow() {
		try {
			setState(await invoke<UpdateState>('update_check_now'))
		} catch (error) {
			console.error('update check failed', error)
		}
	}

	// Rust reads the settings from the store, so the write has to land before it re-checks.
	async function setChannel(value: UpdateChannel) {
		await writeConfigNow(CONFIG_KEYS.updateChannel, value)
		await checkNow()
	}

	async function setAutoUpdate(value: boolean) {
		await writeConfigNow(CONFIG_KEYS.autoUpdate, value)
		await checkNow()
	}

	async function remindLater() {
		try {
			setState(await invoke<UpdateState>('update_remind_later'))
		} catch (error) {
			console.error('failed to snooze the update reminder', error)
		}
	}

	async function installNow() {
		try {
			// Resolves only if nothing was installed; on success the app relaunches before it returns.
			await invoke('update_install_now')
		} catch (error) {
			console.error(error)
			setErrorModal?.({ open: true, log: String(error) })
		}
	}

	function setFakeUpdate(value: boolean) {
		setFakeUpdateState(value)
		try {
			localStorage.setItem(FAKE_UPDATE_KEY, value ? '1' : '0')
		} catch {
			/* private mode — the flag still holds for this session */
		}
	}

	async function updateApp() {
		if (fakeUpdate && !hasAvailableUpdate(state)) {
			await dialog.message('This is a faked update (dev mode). No download will happen.', { title: m.updateVersion(), kind: 'info' })
			return
		}
		const shouldUpdate = await dialog.ask(m.askForUpdateBody({ version: state.version ?? '' }), {
			title: m.askForUpdateTitle(),
			kind: 'info',
			cancelLabel: m.cancelUpdate(),
			okLabel: m.confirmUpdate(),
		})
		if (shouldUpdate) await installNow()
	}

	return (
		<UpdaterContext.Provider
			value={{
				state,
				availableUpdate: hasAvailableUpdate(state) || fakeUpdate,
				updateApp,
				checkNow,
				channel,
				setChannel,
				installNow,
				remindLater,
				autoUpdate,
				setAutoUpdate,
				fakeUpdate,
				setFakeUpdate,
			}}>
			{children}
		</UpdaterContext.Provider>
	)
}
