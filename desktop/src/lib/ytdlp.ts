import { platform } from '@tauri-apps/plugin-os'
import { invoke } from '@tauri-apps/api/core'
import * as fs from '@tauri-apps/plugin-fs'
import * as path from '@tauri-apps/api/path'
import { ytDlpAssetNames, ytDlpDownloadUrl } from './config'

const platformName = platform()
const assetName = ytDlpAssetNames[platformName as keyof typeof ytDlpAssetNames]

async function getBinaryPath() {
	const localDataPath = await path.appLocalDataDir()
	return await path.join(localDataPath, assetName)
}

export async function exists() {
	const binaryPath = await getBinaryPath()
	return await fs.exists(binaryPath)
}

export async function getLatestVersion(): Promise<string> {
	return await invoke<string>('get_latest_ytdlp_version')
}

export async function downloadYtDlp(version: string) {
	const url = ytDlpDownloadUrl(version, platformName as keyof typeof ytDlpAssetNames)
	const binaryPath = await getBinaryPath()
	await invoke('download_file', { url, path: binaryPath })
}

export async function downloadAudio(url: string, inDocuments?: boolean) {
	const outPath = await invoke<string>('get_temp_path', { ext: 'm4a', inDocuments })
	await invoke<string>('download_audio', { url, outPath })
	return outPath
}
