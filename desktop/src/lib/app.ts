import * as fsExt from '@tauri-apps/plugin-fs'
import { load } from '@tauri-apps/plugin-store'
import * as config from './config'

export async function resetApp() {
	const modelPath = localStorage.getItem(config.PREF_KEY_MODEL_PATH)
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

export function getIssueUrl(logs: string) {
	return `https://github.com/thewh1teagle/vibe/issues/new?labels=bug&template=bug_report.yaml&title=App+reports+bug+&logs=${encodeURIComponent(logs)}`
}
