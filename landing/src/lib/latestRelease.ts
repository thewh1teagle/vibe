interface Asset {
	url: string
	name: string
	platform: 'macos' | 'linux' | 'windows'
	arch: 'darwin-x86_64' | 'darwin-aarch64' | 'windows-x86_64' | 'linux-x86_64' | 'unknown'
}

interface LatestRelease {
	version: string
	assets: Array<Asset>
}
declare module '$lib/latest_release.json' {
	const latestRelease: LatestRelease
	export default latestRelease
}
