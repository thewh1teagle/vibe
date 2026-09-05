/**
 * Release notes live in `i18n/changelog/<version>.md`, one file per app
 * release, written in the same PR as the version bump. The frontmatter carries
 * the version, the date, and a headline; the body is `## New`, `## Improved`,
 * `## Fixed` sections of bullets, rendered with a badge each.
 *
 * A translation is the same file under `i18n/changelog/<locale>/<version>.md`,
 * with a `source` hash of the English file it was made from. Only the English
 * notes are bundled; a locale's files are fetched when that locale asks for
 * them, and any release without one falls back to English whole — never bullet
 * by bullet, which would interleave two languages inside one entry.
 */
import { marked } from 'marked'

const files = import.meta.glob('../../../i18n/changelog/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const translations = import.meta.glob('../../../i18n/changelog/*/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>

export const sections = ['New', 'Improved', 'Fixed'] as const
export type Section = (typeof sections)[number]

export interface Release {
	version: string
	date: string
	title: string
	/** The locale this entry is written in, so the page can set its direction. */
	locale: string
	/** Bullets with their Markdown already rendered, once, at load. */
	items: { section: Section; html: string }[]
}

function parse(raw: string, locale: string): Release {
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
	return { version: meta.version, date: meta.date, title: meta.title, locale, items }
}

function compareVersions(a: string, b: string) {
	const pa = a.split('.').map(Number)
	const pb = b.split('.').map(Number)
	for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pb[i] ?? 0) - (pa[i] ?? 0)
	return 0
}

/** Every release in English, newest first. What the page paints before translations land. */
export const releases: Release[] = Object.values(files)
	.map((raw) => parse(raw, 'en-US'))
	.sort((a, b) => compareVersions(a.version, b.version))

/**
 * The same list with every entry this locale has translated swapped in. One
 * request per translated release, so a locale that has ten of them costs ten
 * small files rather than the whole archive in every language.
 */
export async function loadReleases(locale: string): Promise<Release[]> {
	const wanted = Object.entries(translations).filter(([path]) => path.split('/').at(-2) === locale)
	if (wanted.length === 0) return releases
	const loaded = await Promise.all(
		wanted.map(async ([path, load]) => {
			try {
				return parse(await load(), locale)
			} catch {
				// A malformed or half-written translation must not take the page down.
				console.warn(`changelog: could not read ${path}`)
				return null
			}
		}),
	)
	const byVersion = new Map(loaded.filter((entry): entry is Release => entry !== null).map((entry) => [entry.version, entry]))
	return releases.map((release) => byVersion.get(release.version) ?? release)
}

export function findRelease(version: string | undefined, list: Release[] = releases) {
	const wanted = (version ?? '').replace(/^v/, '')
	return list.find((r) => r.version === wanted)
}
