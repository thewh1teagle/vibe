import { invoke } from '@tauri-apps/api/core'
import * as path from '@tauri-apps/api/path'
import * as fs from '@tauri-apps/plugin-fs'
import * as config from './config'
import { Dispatch, SetStateAction } from 'react'
import { load } from '@tauri-apps/plugin-store'
import * as keepAwake from 'tauri-plugin-keepawake-api'

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

export async function getIssueUrl(logs: string) {
	return `https://github.com/thewh1teagle/vibe/issues/new?assignees=octocat&labels=bug&projects=&template=bug_report.yaml&title=App+reports+bug+&logs=${encodeURIComponent(
		logs
	)}`
}

export async function openPath(path: NamedPath) {
	await invoke('open_path', { path: path.path })
}

export async function getModelsFolder() { }

export function formatSpeaker(speaker?: string, prefix = 'Speaker') {
	return `${prefix} ${speaker ?? '?'}: `
}

export async function startKeepAwake() {
	try {
		console.log('start keepawake')
		keepAwake.start({ display: true, idle: true, sleep: true })
	} catch (e) {
		console.error(`Keep awake failed: ${e}`)
	}
}

export async function stopKeepAwake() {
	console.log('stop keepawake')
	try {
		keepAwake.stop()
	} catch (e) {
		console.error(`Keep awake failed: ${e}`)
	}
}

