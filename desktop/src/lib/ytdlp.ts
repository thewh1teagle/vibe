import { platform, arch } from '@tauri-apps/plugin-os'
import { invoke } from '@tauri-apps/api/core'
import * as fs from '@tauri-apps/plugin-fs'
import * as path from '@tauri-apps/api/path'
import { ytDlpAssetNames, ytDlpDownloadUrl } from './config'

// Resolved on demand rather than at import time: `platform()` reads `window`, so touching
// it at module scope makes this file unimportable outside a webview (tests included).
function getPlatformArch() {
	return `${platform()}-${arch()}`
}

async function getBinaryPath() {
	const localDataPath = await path.appLocalDataDir()
	return await path.join(localDataPath, ytDlpAssetNames[getPlatformArch()])
}

export async function exists() {
	const binaryPath = await getBinaryPath()
	return await fs.exists(binaryPath)
}

export async function getLatestVersion(): Promise<string> {
	return await invoke<string>('get_latest_ytdlp_version')
}

export async function downloadYtDlp(version: string) {
	const url = ytDlpDownloadUrl(version, getPlatformArch())
	const binaryPath = await getBinaryPath()
	await invoke('download_file', { url, path: binaryPath })
}

export async function downloadAudio(url: string) {
	const outPath = await invoke<string>('get_temp_path', { ext: 'm4a' })
	await invoke<string>('download_audio', { url, outPath })
	return outPath
}

/** Every link in the box, one per line or several separated by spaces, without repeats. */
export function parseMediaLinks(input: string): string[] {
	return [...new Set(input.split(/\s+/).filter(Boolean))]
}
