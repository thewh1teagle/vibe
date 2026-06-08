import { app } from '@tauri-apps/api'
import { invoke } from '@tauri-apps/api/core'
import { listModels } from './fs'
import * as os from '@tauri-apps/plugin-os'

async function getPrettyVersion() {
	const appVersion = await app.getVersion()
	const appName = await app.getName()
	let version = `${appName} ${appVersion}`
	const avx2Enabled = await invoke('is_avx2_enabled')
	if (!avx2Enabled) {
		version += ` (older cpu)`
	}
	return version
}

async function getAppInfo() {
	const appVersion = await getPrettyVersion()
	const arch = os.arch()
	const platform = os.platform()
	const osVer = os.version()
	const osType = os.type()
	const models = (await listModels()).map((e) => e.name).join(', ')
	const defaultModel = localStorage.getItem('prefs_model_path')?.split('/')?.pop() ?? 'Not Found'
	return [
		`App Version: ${appVersion}`,
		`Arch: ${arch}`,
		`Platform: ${platform}`,
		`Kernel Version: ${osVer}`,
		`OS: ${osType}`,
		`OS Version: ${osVer}`,
		`Models: ${models}`,
		`Default Model: ${defaultModel}`,
	].join('\n')
}

export async function collectLogs() {
	try {
		const info = await getAppInfo()
		return info
	} catch (e) {
		console.error(e)
		return `Couldn't collect logs ${e}`
	}
}
