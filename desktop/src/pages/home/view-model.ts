import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { listModels } from '~/lib/fs'
import { usePreferenceProvider } from '~/providers/preference'

export function viewModel() {
	const navigate = useNavigate()
	const preference = usePreferenceProvider()
	const { t } = useTranslation()
	const [isModelPreloading, setIsModelPreloading] = useState(false)

	async function checkIfCrashedRecently() {
		try {
			const isCrashed = await invoke<boolean>('is_crashed_recently')
			if (isCrashed) {
				dialog.message(t('common.crashed-recently'))
				await invoke('rename_crash_file')
			}
		} catch {
			// ignore if command doesn't exist
		}
	}

	async function checkModelExists(): Promise<string | null> {
		try {
			const filtered = await listModels()
			if (filtered.length === 0) {
				navigate('/setup')
				return null
			} else {
				let resolvedPath = preference.modelPath
				if (!resolvedPath || !(await fs.exists(resolvedPath))) {
					resolvedPath = filtered[0].path
					preference.setModelPath(resolvedPath)
				}
				return resolvedPath
			}
		} catch {
			navigate('/setup')
			return null
		}
	}

	async function preloadModel(modelPath: string) {
		try {
			setIsModelPreloading(true)
			await invoke('preload_model', { modelPath, gpuDevice: preference.gpuDevice })
		} catch (e) {
			console.error('Model preload failed:', e)
		} finally {
			setIsModelPreloading(false)
		}
	}

	useEffect(() => {
		checkIfCrashedRecently()
		if (preference.transcriptionProvider === 'groq') return
		checkModelExists().then((modelPath) => {
			if (modelPath) {
				preloadModel(modelPath)
			}
		})
	}, [])

	return {
		preference,
		isModelPreloading,
	}
}
