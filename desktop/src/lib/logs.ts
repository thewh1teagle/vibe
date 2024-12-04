import { app } from '@tauri-apps/api'
import { invoke } from '@tauri-apps/api/core'
import { ls } from './utils'
import * as os from '@tauri-apps/plugin-os'

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

export async function getAppInfo() {
	const appVersion = await getPrettyVersion()
	const commitHash = await invoke('get_commit_hash')
	let x86Features = await invoke<string | null>('get_x86_features')
	if (x86Features) {
		x86Features = JSON.stringify(x86Features, null, 0)
	} else {
		x86Features = 'CPU feature detection is not supported on this architecture.'
	}
	const arch = os.arch()
	const platform = os.platform()
	const kVer = os.version()
	const osType = os.type()
	const osVer = os.version()
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

export async function collectLogs() {
	try {
		let info = await getAppInfo()
		const logs: string = await invoke<string>('get_logs')
		const filteredLogs = logs
			.split('\n')
			.filter((l) => l.toLowerCase().includes('error')) // Filter lines with "debug"
			.slice(-10) // Take the last 3 lines
			.map((line) => {
				try {
					console.log('line => ', line)
					const parsed = JSON.parse(line) // Deserialize JSON
					return parsed?.fields?.message || 'No message found' // Extract .message or fallback
				} catch (e) {
					return 'Invalid JSON' // Handle invalid JSON
				}
			})
			.join('\n')
		const templatedLogs = `<details>
<summary>logs</summary>

\`\`\`console
${filteredLogs}
\`\`\`
</details>
`
		info += `\n\n\n${templatedLogs}`
		return info
	} catch (e) {
		console.error(e)
		return `Couldn't collect logs ${e}`
	}
}
