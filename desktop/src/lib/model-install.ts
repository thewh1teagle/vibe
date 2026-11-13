import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { join } from '@tauri-apps/api/path'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { downloadModel, getModelsFolder } from './model'
import { catalogFilename, classifyInstallError, type CatalogModel } from './model-catalog'

export interface InstallState {
	/** The one install in flight. `progress` is a percentage, `null` until the first bytes are reported. */
	active: { id: string; name: string; progress: number | null } | null
	/** The model whose download did not match the catalog; cleared by the next attempt. */
	unverified: string | null
	/** Counts finished installs, so a settings page opened mid-download knows to reread the folder. */
	completed: number
}

export type InstallResult = { status: 'installed'; path: string } | { status: 'cancelled' } | { status: 'busy' } | { status: 'offline' } | { status: 'unverified' }

// Kept outside React: the download outlives the settings page, which can be closed and reopened
// while it runs.
let state: InstallState = { active: null, unverified: null, completed: 0 }
const listeners = new Set<() => void>()

function update(patch: Partial<InstallState>) {
	state = { ...state, ...patch }
	for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export function useInstallState(): InstallState {
	return useSyncExternalStore(subscribe, () => state)
}

/**
 * Download a catalog model into the models folder through the same backend command as every other
 * model download. Progress and cancellation are global there (one `download_progress` stream, one
 * `abort_download`), so only one install runs at a time. Errors other than a failed verification
 * are thrown for the caller to present.
 */
export async function installCatalogModel(model: CatalogModel): Promise<InstallResult> {
	if (state.active) return { status: 'busy' }
	update({ active: { id: model.id, name: model.name, progress: null }, unverified: null })
	const unlisten = await listen<[number, number]>('download_progress', ({ payload: [current, total] }) => {
		if (state.active?.id !== model.id || !(total > 0)) return
		const progress = Math.min(100, (current / total) * 100)
		if (progress > (state.active.progress ?? 0)) update({ active: { ...state.active, progress } })
	})
	try {
		if (!(await invoke<boolean>('is_online'))) return { status: 'offline' }
		const path = await join(await getModelsFolder(), catalogFilename(model))
		const installed = await downloadModel({ url: model.url, size: model.size, sha256: model.sha256 }, { replacePath: path })
		if (!installed) return { status: 'cancelled' }
		update({ completed: state.completed + 1 })
		return { status: 'installed', path: installed }
	} catch (error) {
		if (classifyInstallError(error) !== 'verification') throw error
		console.error('[models] the download did not match the catalog:', error)
		update({ unverified: model.id })
		return { status: 'unverified' }
	} finally {
		unlisten()
		update({ active: null })
	}
}

/** Reread the models folder when an install finishes while this component is on screen. */
export function useInstallCompleted(onCompleted: () => void) {
	const { completed } = useInstallState()
	const seen = useRef(completed)
	useEffect(() => {
		if (completed === seen.current) return
		seen.current = completed
		onCompleted()
	}, [completed])
}

export function cancelInstall() {
	return emit('abort_download')
}
