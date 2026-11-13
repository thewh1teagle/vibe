/**
 * Dotted versions compared number by number: yt-dlp's calendar tags (`2026.08.19`, occasionally
 * with a same-day suffix like `2026.08.19.1`) and the app's own `3.3.2`. Comparing them as plain
 * strings makes every differing tag look newer, which is what turned the yt-dlp update prompt into
 * a nag. An unknown (missing or unparsable) current version counts as older.
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
