import { platform, arch } from '@tauri-apps/plugin-os'
import { invoke } from '@tauri-apps/api/core'
import * as fs from '@tauri-apps/plugin-fs'
import * as path from '@tauri-apps/api/path'
import { ytDlpAssetNames } from './config'

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

/** The backend builds the release URL, checks the release's SHA2-256SUMS and picks the path. */
export async function downloadYtDlp(version: string) {
	await invoke('download_ytdlp', { version })
}

export async function downloadAudio(url: string) {
	const outPath = await invoke<string>('get_temp_path', { ext: 'm4a' })
	await invoke<string>('download_audio', { url, outPath })
	return outPath
}

function isHttpUrl(token: string) {
	try {
		const { protocol } = new URL(token)
		return protocol === 'http:' || protocol === 'https:'
	} catch {
		return false
	}
}

/**
 * The box's text split into http(s) links (one per line or several separated by spaces, without
 * repeats) and the leftover words that are not links. Only links ever reach yt-dlp.
 */
export function splitMediaLinks(input: string): { links: string[]; rest: string[] } {
	const tokens = input.split(/\s+/).filter(Boolean)
	return { links: [...new Set(tokens.filter(isHttpUrl))], rest: tokens.filter((token) => !isHttpUrl(token)) }
}

/** Every http(s) link in the box, without repeats. */
export function parseMediaLinks(input: string): string[] {
	return splitMediaLinks(input).links
}
