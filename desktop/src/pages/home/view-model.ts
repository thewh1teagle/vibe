import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import { path } from '@tauri-apps/api'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ls } from '~/lib/fs'
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
			const configPath = await invoke<string>('get_models_folder')
			const entries = await ls(configPath)
			const filtered = entries.filter((e) => e.name?.endsWith('.bin'))
			if (filtered.length === 0) {
				if (!preference.skippedSetup) {
					navigate('/setup')
				}
				return null
			} else {
				let resolvedPath = preference.modelPath
				if (!resolvedPath || !(await fs.exists(resolvedPath))) {
					resolvedPath = await path.join(configPath, filtered[0].name)
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
