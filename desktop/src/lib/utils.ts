import { invoke } from '@tauri-apps/api/core'
import * as pathExt from '@tauri-apps/api/path'
import * as fsExt from '@tauri-apps/plugin-fs'
import * as config from './config'
import { Dispatch, SetStateAction } from 'react'
import { load } from '@tauri-apps/plugin-store'
import * as keepAwake from 'tauri-plugin-keepawake-api'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export interface NamedPath {
	name: string
	path: string
}

export type ModifyState<T> = Dispatch<SetStateAction<T>>

export async function pathToNamedPath(pathString: string) {
	const name = await pathExt.basename(pathString)
	return { name, path: pathString }
}

export async function ls(where: string) {
	const entries = await fsExt.readDir(where)
	const paths: NamedPath[] = []
	for (const entry of entries) {
		const abs = await pathExt.join(where, entry.name)
		paths.push({ name: entry.name, path: abs })
	}
	return paths
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
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
		logs
	)}`
}

export async function openPath(path: NamedPath) {
	await invoke('open_path', { path: path.path })
}

export async function getModelsFolder() {}

export async function startKeepAwake() {
	try {
		keepAwake.start({ display: true, idle: true, sleep: true })
	} catch (e) {
		console.error(`Keep awake failed: ${e}`)
	}
}

export async function stopKeepAwake() {
	try {
		keepAwake.stop()
	} catch (e) {
		console.error(`Keep awake failed: ${e}`)
	}
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

export function randomString(length: number, prefix: string, suffix: string) {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
	let result = prefix
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result + suffix
}

export async function getFilenameFromUrl(url: string) {
	// Get it from the url itself parse as url object and get last part
	const urlObj = new URL(url)
	const fileName = urlObj.pathname.split('/').pop() || ''
	return fileName
}
