import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { platform } from '@tauri-apps/plugin-os'
import { useEffect, useState } from 'react'
import * as config from '~/lib/config'
import { ModelPresetId } from '~/lib/config'
import { NamedPath } from '~/lib/types'
import { listModels } from '~/lib/fs'
import { usePreferenceProvider } from '~/providers/preference'
import { useNavigate } from 'react-router-dom'
import { load } from '@tauri-apps/plugin-store'

export interface GpuDevice {
	index: number
	name: string
	description: string
	type: string
}

async function openModelPath() {
	const dst = await invoke<string>('get_models_folder')
	invoke('open_path', { path: dst })
}

async function openModelsUrl() {
	openUrl(config.modelsDocURL)
}

export function viewModel() {
	const [models, setModels] = useState<NamedPath[]>([])
	const preference = usePreferenceProvider()
	const [gpuDevices, setGpuDevices] = useState<GpuDevice[]>([])
	const isMacOS = platform() === 'macos'
	const navigate = useNavigate()

	async function selectPresetForDownload(presetId: string) {
		preference.setSelectedModelPreset(presetId as ModelPresetId)
		navigate('/setup')
	}

	async function loadModels() {
		const found = await listModels()
		setModels(found)
	}

	async function getDefaultModel() {
		if (!preference.modelPath) {
			const files = await listModels()
			if (files.length > 0) {
				preference.setModelPath(files[0].path)
			}
		}
	}

	async function changeModelsFolder() {
		const path = await open({ directory: true, multiple: false })
		if (path) {
			const store = await load(config.storeFilename)
			await store.set('models_folder', path)
			await store.save()
			await loadModels()
			await getDefaultModel()
		}
	}

	async function loadGpuDevices() {
		try {
			const devices = await invoke<GpuDevice[]>('get_gpu_devices')
			setGpuDevices(devices)
		} catch (error) {
			console.error(error)
			setGpuDevices([])
		}
	}

	useEffect(() => {
		loadModels()
		getDefaultModel()
		loadGpuDevices()
	}, [])

	return {
		preference,
		openModelPath,
		openModelsUrl,
		models,
		loadModels,
		changeModelsFolder,
		presets: config.modelPresets,
		selectPresetForDownload,
		gpuDevices,
		isMacOS,
	}
}
