import { invoke } from '@tauri-apps/api/core'
import * as pathExt from '@tauri-apps/api/path'
import * as fsExt from '@tauri-apps/plugin-fs'

async function getFilenameFromUrl(url: string) {
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
	const modelPath = await pathExt.join(modelsFolder, filename)
	if (await fsExt.exists(modelPath)) {
		return modelPath
	}
	await invoke('download_model', { url, path: modelPath })
	return modelPath
}
