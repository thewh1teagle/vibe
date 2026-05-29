import { invoke } from '@tauri-apps/api/core'
import * as pathExt from '@tauri-apps/api/path'
import * as fsExt from '@tauri-apps/plugin-fs'
import { NamedPath } from './types'

export async function ls(where: string): Promise<NamedPath[]> {
	const entries = await fsExt.readDir(where)
	const paths: NamedPath[] = []
	for (const entry of entries) {
		const abs = await pathExt.join(where, entry.name)
		paths.push({ name: entry.name, path: abs })
	}
	return paths
}

export async function listModels(): Promise<NamedPath[]> {
	const modelsFolder = await invoke<string>('get_models_folder')
	const entries = await ls(modelsFolder)
	return entries.filter((e) => e.name?.endsWith('.bin'))
}
