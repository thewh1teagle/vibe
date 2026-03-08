import * as pathExt from '@tauri-apps/api/path'
import * as fsExt from '@tauri-apps/plugin-fs'
import { NamedPath } from './types'

export async function pathToNamedPath(pathString: string): Promise<NamedPath> {
	const name = await pathExt.basename(pathString)
	return { name, path: pathString }
}

export async function ls(where: string): Promise<NamedPath[]> {
	const entries = await fsExt.readDir(where)
	const paths: NamedPath[] = []
	for (const entry of entries) {
		const abs = await pathExt.join(where, entry.name)
		paths.push({ name: entry.name, path: abs })
	}
	return paths
}
