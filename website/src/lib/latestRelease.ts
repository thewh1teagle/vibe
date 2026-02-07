export interface Asset {
	url: string
	name: string
	platform: 'macos' | 'linux' | 'windows'
	arch: 'darwin-x86_64' | 'darwin-aarch64' | 'windows-x86_64' | 'linux-x86_64' | 'unknown'
}

export interface LatestRelease {
	version: string
	assets: Array<Asset>
}
