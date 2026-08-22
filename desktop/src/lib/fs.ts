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

/** Regular files only — `readDir` also reports directories, and a folder named `x.bin` is no model. */
export async function lsFiles(where: string): Promise<NamedPath[]> {
	const entries = await fsExt.readDir(where)
	const paths: NamedPath[] = []
	for (const entry of entries) {
		if (!entry.isFile) continue
		paths.push({ name: entry.name, path: await pathExt.join(where, entry.name) })
	}
	return paths
}
