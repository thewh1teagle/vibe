import { invoke } from '@tauri-apps/api/core'
import * as pathExt from '@tauri-apps/api/path'
import * as fsExt from '@tauri-apps/plugin-fs'
export function randomString(length: number, prefix: string, suffix: string) {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
	let result = prefix
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result + suffix
}

export async function getFilenameFromUrl(url: string) {
	const urlObj = new URL(url)
	const fileName = urlObj.pathname.split('/').pop() || ''
	return fileName
}

export async function downloadModel(url: string) {
	let filename = await getFilenameFromUrl(url)
	if (!filename.endsWith('.bin')) {
		filename = 'ggml-model.bin'
	}
	const modelsFolder = await invoke<string>('get_models_folder')
	let modelPath = await pathExt.join(modelsFolder, filename)
	if (await fsExt.exists(modelPath)) {
		filename = randomString(8, 'ggml-model_', '.bin')
		modelPath = await pathExt.join(modelsFolder, filename)
	}
	await invoke('download_model', { url, path: modelPath })
	return modelPath
}
