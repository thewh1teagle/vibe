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

/**
 * yt-dlp tags are calendar versions — `2026.08.19`, occasionally with a same-day suffix like
 * `2026.08.19.1`. Comparing them as plain strings makes every differing tag look like an update,
 * which is what turned the update prompt into a nag, so compare the numbers segment by segment.
 * An unknown (missing or unparsable) current version counts as older, so an update is offered.
 */
export function isNewerVersion(candidate: string, current: string | null | undefined): boolean {
	const parse = (version: string) => version.split('.').map((part) => Number.parseInt(part, 10))
	const candidateParts = parse(candidate)
	if (candidateParts.some(Number.isNaN)) return false
	if (!current) return true
	const currentParts = parse(current)
	if (currentParts.some(Number.isNaN)) return true
	for (let index = 0; index < Math.max(candidateParts.length, currentParts.length); index += 1) {
		const left = candidateParts[index] ?? 0
		const right = currentParts[index] ?? 0
		if (left !== right) return left > right
	}
	return false
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
