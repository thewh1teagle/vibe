import { invoke } from '@tauri-apps/api/core'
import { useEffect } from 'react'
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

	async function checkModelExists() {
		try {
			const configPath = await invoke<string>('get_models_folder')
			const entries = await ls(configPath)
			const filtered = entries.filter((e) => e.name?.endsWith('.bin'))
			if (filtered.length === 0) {
				if (!preference.skippedSetup) {
					navigate('/setup')
				}
			} else {
				if (!preference.modelPath || !(await fs.exists(preference.modelPath))) {
					const absPath = await path.join(configPath, filtered[0].name)
					preference.setModelPath(absPath)
				}
			}
		} catch {
			navigate('/setup')
		}
	}

	useEffect(() => {
		checkIfCrashedRecently()
		checkModelExists()
	}, [])

	return {
		preference,
	}
}
