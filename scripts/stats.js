const assetsURL = 'https://api.github.com/repos/thewh1teagle/vibe/releases'
const patterns = ['.exe', '.dmg', '.deb', '.rpm']
const patternsNames = {
	'.exe': 'Windows',
	'.dmg': 'macOS',
	'.deb': 'Linux',
	'.rpm': 'Linux',
}
// Get releases JSON from Github
const res = await fetch(assetsURL)
if (!res.ok) {
	throw new Error(await res.text())
}
const releases = await res.json()

// Iterate release and increment in hashmap
const stats = {}
for (const release of releases) {
	let tagName = release?.['tag_name'] || ''
	for (const asset of release?.assets || []) {
		const name = asset?.name || ''
		tagName = tagName.toLowerCase().replace('v', '')

		const downloadCount = asset?.['download_count'] || 0
		const kind = patterns.find((pattern) => name.includes(pattern))
		const prettyKind = patternsNames[kind]
		if (kind) {
			stats[prettyKind] = (stats[prettyKind] || 0) + downloadCount
		}
	}
}

const total = Object.values(stats).reduce((acc, val) => acc + val, 0)
stats['Total Downloads'] = total
stats['Date'] = new Date().toLocaleDateString('en-US', { timeZone: 'UTC' })

console.log(JSON.stringify(stats, null, 4))
