import { invoke } from '@tauri-apps/api/core'
import * as fsExt from '@tauri-apps/plugin-fs'
import { load } from '@tauri-apps/plugin-store'
import * as config from './config'
import { NamedPath } from './types'

export async function resetApp() {
	const modelPath = localStorage.getItem('model_path')
	try {
		const store = await load(config.storeFilename)
		await store.clear()
		if (modelPath) {
			try {
				await fsExt.remove(modelPath)
			} catch (e) {
				console.error(e)
			}
		}
	} catch (e) {
		console.error(e)
	} finally {
		localStorage.clear()
		location.href = '/setup'
	}
}

export async function getIssueUrl(logs: string) {
	return `https://github.com/thewh1teagle/vibe/issues/new?assignees=octocat&labels=bug&projects=&template=bug_report.yaml&title=App+reports+bug+&logs=${encodeURIComponent(
		logs,
	)}`
}

export async function openPath(path: NamedPath) {
	await invoke('open_path', { path: path.path })
}
