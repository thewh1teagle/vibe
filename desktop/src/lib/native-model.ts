import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { join } from '@tauri-apps/api/path'
import { remove } from '@tauri-apps/plugin-fs'
import * as config from '~/lib/config'
import { getFilenameFromUrl } from '~/lib/model'

export type NativeInstallOutcome = { status: 'installed'; path: string } | { status: 'cancelled' } | { status: 'failed'; error: string }

export interface InstallNativeModelOptions {
	/** Aggregate 0–100 progress over every component's pinned size. */
	onProgress?: (percent: number) => void
}

/** The backend only cleans the staging folder inside `install_model_package`, so a failed or
 * cancelled component download would leave half a package behind. Sweep it here too — best-effort,
 * since a retry re-creates the folder anyway. */
async function removeStaging(staging: string) {
	await remove(staging, { recursive: true }).catch(() => {})
}

/** Download a catalog native model (SenseVoice / FunASR Nano) the way `/setup` downloads Whisper:
 * components stream into a dot-prefixed staging folder, then `install_model_package` writes the
 * manifest and renames the folder into place. */
export async function installNativeModelPackage(entry: config.NativeModelDownload, options: InstallNativeModelOptions = {}): Promise<NativeInstallOutcome> {
	const components = [entry.encoder, entry.model].filter((component) => component !== undefined)
	const totalBytes = components.reduce((sum, component) => sum + (component.size ?? 0), 0)
	let staging: string | null = null
	let unlistenProgress: UnlistenFn | null = null
	try {
		let baseBytes = 0
		let currentBytes = 0
		unlistenProgress = await listen<[number, number]>('download_progress', (event) => {
			const [downloaded, total] = event.payload
			if (total <= 0 || totalBytes <= 0) return
			// Each component restarts at 0–100, so fold it into the whole-package progress.
			options.onProgress?.(Math.min(100, ((baseBytes + (downloaded / total) * currentBytes) / totalBytes) * 100))
		})
		staging = await invoke<string>('prepare_model_package_staging')
		// The encoder is the smaller half, so it goes first: a mid-way failure wastes the least.
		for (const component of components) {
			currentBytes = component.size ?? 0
			const path = await join(staging, await getFilenameFromUrl(component.url))
			const result = await invoke<{ status: string }>('download_model', {
				url: component.url,
				path,
				integrity: { size: component.size, sha256: component.sha256 },
			})
			if (result.status !== 'completed') {
				await removeStaging(staging)
				return { status: 'cancelled' }
			}
			baseBytes += component.size ?? 0
		}
		currentBytes = 0
		const installedPath = await invoke<string>('install_model_package', {
			staging,
			engine: entry.engine,
			revision: entry.revision,
			model: await getFilenameFromUrl(entry.model.url),
			encoder: entry.encoder ? await getFilenameFromUrl(entry.encoder.url) : null,
		})
		options.onProgress?.(100)
		return { status: 'installed', path: installedPath }
	} catch (error) {
		console.error('failed to download native model:', error)
		if (staging) await removeStaging(staging)
		return { status: 'failed', error: String(error) }
	} finally {
		unlistenProgress?.()
	}
}
