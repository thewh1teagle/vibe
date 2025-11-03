import { platform } from '@tauri-apps/plugin-os'
import { ytDlpConfig } from './config'
import * as fs from '@tauri-apps/plugin-fs'
import * as path from '@tauri-apps/api/path'
import { invoke } from '@tauri-apps/api/core'

const platformName = platform()
const { url, name } = ytDlpConfig[platformName as keyof typeof ytDlpConfig]

async function getBinaryPath() {
	const localDataPath = await path.appLocalDataDir()
	const binaryPath = await path.join(localDataPath, name)
	return binaryPath
}

export async function exists() {
	const binaryPath = await getBinaryPath()
	return await fs.exists(binaryPath)
}

export async function downloadYtDlp() {
	const binaryPath = await getBinaryPath()
	await invoke('download_file', { url, path: binaryPath })
}

export async function downloadAudio(url: string, inDocuments?: boolean) {
	if (!(await exists())) {
		await downloadYtDlp()
	}
	const outPath = await invoke<string>('get_temp_path', { ext: 'm4a', inDocuments })
	await invoke<string>('download_audio', { url, outPath })
	return outPath
}
