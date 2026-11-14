import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { ask } from '@tauri-apps/plugin-dialog'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import * as config from '~/lib/config'
import type { ModelIntegrity } from '~/lib/config'
import { bundledHelperModel } from '~/lib/model-catalog-source'
import { isModelFileUsable } from '~/lib/model'
import { usePreferenceProvider } from '~/providers/preference'
import { useToastProvider } from '~/providers/toast'

/** Address and pinned size/hash of a support file, from the catalog bundled with the app. */
function helperDownload(id: 'vad' | 'diarize'): { url: string; integrity: ModelIntegrity } {
	const { url, size, sha256 } = bundledHelperModel(id)
	return { url, integrity: { size, sha256 } }
}

/**
 * Speaker recognition and stable timestamps each need a model on disk. Turning them on therefore
 * means: check for the file, ask before pulling it, download with a progress toast, and only then
 * flip the preference. The transcription options popover and the settings page share this so the
 * gate behaves the same wherever the switch lives.
 */
export function useModelGates() {
	const preference = usePreferenceProvider()
	const progressToast = useToastProvider()

	const ensureModel = useCallback(
		async (options: { filename: string; url: string; title: string; question: string; downloading: string; integrity?: ModelIntegrity }) => {
			const modelsFolder = await invoke<string>('get_models_folder')
			const modelPath = await join(modelsFolder, options.filename)
			// A file that fails its integrity check does not count as installed — download it again.
			if (await isModelFileUsable(modelPath)) return true

			const confirmed = await ask(options.question, { title: options.title, kind: 'info' })
			if (!confirmed) return false

			progressToast.setMessage(options.downloading)
			progressToast.setOpen(true)
			progressToast.setProgress(0)
			try {
				await invoke('download_model', { url: options.url, path: modelPath, integrity: options.integrity })
				toast.success(m.downloadComplete())
				return true
			} finally {
				progressToast.setOpen(false)
				progressToast.setProgress(null)
			}
		},
		[progressToast],
	)

	/** True once the diarization model is on disk, asking to download it when it is not. */
	const ensureDiarizeModel = useCallback(
		() =>
			ensureModel({
				filename: config.diarizeModelFilename,
				...helperDownload('diarize'),
				title: m.diarization(),
				question: m.downloadDiarizeModel(),
				downloading: m.downloadingDiarizeModel(),
			}),
		[ensureModel],
	)

	const toggleDiarization = useCallback(
		async (checked: boolean) => {
			if (!checked) {
				preference.setDiarizeEnabled(false)
				return
			}
			try {
				const ready = await ensureDiarizeModel()
				if (ready) preference.setDiarizeEnabled(true)
			} catch (error) {
				console.error('diarization setup failed:', error)
				toast.error(String(error))
			}
		},
		[ensureDiarizeModel, preference],
	)

	const toggleStableTimestamps = useCallback(
		async (checked: boolean) => {
			if (!checked) {
				preference.setStableTimestampsEnabled(false)
				return
			}
			try {
				const ready = await ensureModel({
					filename: config.vadModelFilename,
					...helperDownload('vad'),
					title: m.stableTimestamps(),
					question: m.stableTimestampsConfirm(),
					downloading: m.downloadingVadModel(),
				})
				if (ready) preference.setStableTimestampsEnabled(true)
			} catch (error) {
				console.error('stable timestamps setup failed:', error)
				toast.error(String(error))
			}
		},
		[ensureModel, preference],
	)

	return { ensureDiarizeModel, toggleDiarization, toggleStableTimestamps }
}
