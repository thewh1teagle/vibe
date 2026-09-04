/**
 * Release notes live in `website/changelog/<version>.md`, one file per app
 * release, written in the same PR as the version bump. The frontmatter carries
 * the version, the date, and a headline; the body is `## New`, `## Improved`,
 * `## Fixed` sections of bullets, rendered with a badge each.
 */
import { marked } from 'marked'

const files = import.meta.glob('../../changelog/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const sections = ['New', 'Improved', 'Fixed'] as const
export type Section = (typeof sections)[number]

export interface Release {
	version: string
	date: string
	title: string
	/** Bullets with their Markdown already rendered, once, at load. */
	items: { section: Section; html: string }[]
}

function parse(raw: string): Release {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
	if (!match) throw new Error('changelog entry without frontmatter')
	const meta: Record<string, string> = {}
	for (const line of match[1].split('\n')) {
		const i = line.indexOf(':')
		if (i > 0)
			meta[line.slice(0, i).trim()] = line
				.slice(i + 1)
				.trim()
				.replace(/^"(.*)"$/, '$1')
	}
	const items: Release['items'] = []
	let section: Section = 'New'
	for (const line of match[2].split('\n')) {
		const heading = line.match(/^##\s+(New|Improved|Fixed)\s*$/)
		if (heading) {
			section = heading[1] as Section
			continue
		}
		const bullet = line.match(/^[-*]\s+(.+)$/)
		if (bullet) items.push({ section, html: marked.parseInline(bullet[1]) as string })
	}
	return { version: meta.version, date: meta.date, title: meta.title, items }
}

function compareVersions(a: string, b: string) {
	const pa = a.split('.').map(Number)
	const pb = b.split('.').map(Number)
	for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pb[i] ?? 0) - (pa[i] ?? 0)
	return 0
}

/** Every release, newest first. */
export const releases: Release[] = Object.values(files)
	.map(parse)
	.sort((a, b) => compareVersions(a.version, b.version))

export function findRelease(version: string | undefined) {
	const wanted = (version ?? '').replace(/^v/, '')
	return releases.find((r) => r.version === wanted)
}
