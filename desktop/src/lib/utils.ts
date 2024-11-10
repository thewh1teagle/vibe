import * as app from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import * as path from '@tauri-apps/api/path'
import * as fs from '@tauri-apps/plugin-fs'
import * as os from '@tauri-apps/plugin-os'
import * as config from './config'
import { Dispatch, SetStateAction } from 'react'
import { load } from '@tauri-apps/plugin-store'

export interface NamedPath {
	name: string
	path: string
}

export type ModifyState<T> = Dispatch<SetStateAction<T>>

export async function pathToNamedPath(pathString: string) {
	const name = await path.basename(pathString)
	return { name, path: pathString }
}

export async function ls(where: string) {
	const entries = await fs.readDir(where)
	const paths: NamedPath[] = []
	for (const entry of entries) {
		const abs = await path.join(where, entry.name)
		paths.push({ name: entry.name, path: abs })
	}
	return paths
}

export function cx(...cns: (boolean | string | undefined)[]): string {
	return cns.filter(Boolean).join(' ')
}

export function formatLongString(str: string, n: number) {
	if (str.length > n) {
		return str.substring(0, n) + '...'
	} else {
		return str
	}
}

export function validPath(path: string) {
	if (config.videoExtensions.some((ext) => path.endsWith(ext))) {
		return true
	}
	if (config.audioExtensions.some((ext) => path.endsWith(ext))) {
		return true
	}
	return false
}

export async function resetApp() {
	const modelPath = localStorage.getItem('model_path')
	try {
		const store = await load(config.storeFilename)
		await store.clear()
		if (modelPath) {
			try {
				await fs.remove(modelPath)
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

export async function getAppInfo() {
	const appVersion = await getPrettyVersion()
	const commitHash = await invoke('get_commit_hash')
	let x86Features = await invoke<string | null>('get_x86_features')
	if (x86Features) {
		x86Features = JSON.stringify(x86Features, null, 4)
	} else {
		x86Features = 'CPU feature detection is not supported on this architecture.'
	}
	const arch = await os.arch()
	const platform = await os.platform()
	const kVer = await os.version()
	const osType = await os.type()
	const osVer = await os.version()
	const configPath = await invoke<string>('get_models_folder')
	const entries = await ls(configPath)
	const cudaVersion = await invoke('get_cuda_version')
	const models = entries
		.filter((e) => e.name?.endsWith('.bin'))
		.map((e) => e.name)
		.join(', ')
	const defaultModel = localStorage.getItem('prefs_model_path')?.split('/')?.pop() ?? 'Not Found'
	const cargoFeatures = (await invoke<string[]>('get_cargo_features')) || 'n/a'
	return [
		`App Version: ${appVersion}`,
		`Commit Hash: ${commitHash}`,
		`Arch: ${arch}`,
		`Platform: ${platform}`,
		`Kernel Version: ${kVer}`,
		`OS: ${osType}`,
		`OS Version: ${osVer}`,
		`Cuda Version: ${cudaVersion || 'n/a'}`,
		`Models: ${models}`,
		`Default Model: ${defaultModel}`,
		`Cargo features: ${cargoFeatures.join(', ')}`,
		`\n\n${x86Features}`,
	].join('\n')
}

export async function getPrettyVersion() {
	const appVersion = await app.getVersion()
	const appName = await app.getName()
	let version = `${appName} ${appVersion}`
	const cudaVersion = await invoke('get_cuda_version')
	const rocmVersion = await invoke('get_rocm_version')
	const avx2Enabled = await invoke('is_avx2_enabled')
	const isPortable = await invoke('is_portable')
	if (cudaVersion) {
		version += ` (cuda ${cudaVersion})`
	}
	if (!avx2Enabled) {
		version += ` (older cpu)`
	}
	if (isPortable) {
		version += ` (portable)`
	}
	if (rocmVersion) {
		version += ` (rocm ${rocmVersion})`
	}
	return version
}

export async function getIssueUrl(logs: string) {
	return `https://github.com/thewh1teagle/vibe/issues/new?assignees=octocat&labels=bug&projects=&template=bug_report.yaml&title=Bug:&logs=${encodeURIComponent(
		logs
	)}`
}

export async function openPath(path: NamedPath) {
	await invoke('open_path', { path: path.path })
}

export async function getModelsFolder() {}

export function formatSpeaker(speaker?: number, prefix = 'Speaker') {
	return `${prefix} ${speaker ?? '?'}: `
}
