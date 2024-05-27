const assetsURL = 'https://api.github.com/repos/thewh1teagle/vibe/releases'
const patterns = ['.exe', '.dmg', '.deb']
const patternsNames = {
	'.exe': 'Windows',
	'.dmg': 'macOS',
	'.deb': 'Linux',
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
		if (kind) {
			stats[kind] = (stats[kind] || 0) + downloadCount
		}
	}
}

// Raw stats
const total = Object.values(stats).reduce((acc, val) => acc + val, 0)
stats['total'] = total
stats['date'] = new Date().toLocaleDateString('en-US', { timeZone: 'UTC' })

// Pretty stats
const prettyStats = {}
for (const pattern in patternsNames) {
	prettyStats[patternsNames[pattern]] = stats[pattern] || 0
}
prettyStats['Total Downloads'] = stats['total'] || 0
prettyStats['Date'] = stats['date'] || ''

console.log(JSON.stringify(prettyStats, null, 4))
