/**
 * The two user-facing docs shown on /docs. English lives in
 * `i18n/docs/en-US/<slug>.md`; a translation is the same file under
 * `i18n/docs/<locale>/<slug>.md`, carrying a `source` hash of the English
 * file it was made from.
 *
 * Only the English pages are bundled; a locale's pages are fetched when that
 * locale asks for them, and a page without a translation falls back to English
 * whole — never paragraph by paragraph.
 */
const english = import.meta.glob('../../../i18n/docs/en-US/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const translations = import.meta.glob(['../../../i18n/docs/*/*.md', '!../../../i18n/docs/en-US/*.md'], { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>

export const slugs = ['install', 'models'] as const
export type Slug = (typeof slugs)[number]

export interface Doc {
	slug: Slug
	/** The locale this page is written in, so the page can set its direction. */
	locale: string
	markdown: string
}

/** Strips the `source` hash the audit script stamps in; it is bookkeeping, not content. */
function strip(raw: string) {
	return raw.replace(/^<!--\s*source:\s*[0-9a-f]+\s*-->\n*/, '')
}

function bySlug(files: Record<string, string>): Partial<Record<Slug, string>> {
	const found: Partial<Record<Slug, string>> = {}
	for (const [path, raw] of Object.entries(files)) {
		const slug = path.split('/').at(-1)?.replace(/\.md$/, '') as Slug
		if (slugs.includes(slug)) found[slug] = strip(raw)
	}
	return found
}

const englishBySlug = bySlug(english)

/** The English pages. What /docs paints before a translation lands. */
export const docs: Doc[] = slugs.map((slug) => ({ slug, locale: 'en-US', markdown: englishBySlug[slug] ?? '' }))

/** The same pages with whatever this locale has translated swapped in. */
export async function loadDocs(locale: string): Promise<Doc[]> {
	if (locale === 'en-US') return docs
	const wanted = Object.entries(translations).filter(([path]) => path.split('/').at(-2) === locale)
	if (wanted.length === 0) return docs
	const loaded = await Promise.all(
		wanted.map(async ([path, load]) => {
			const slug = path.split('/').at(-1)?.replace(/\.md$/, '') as Slug
			if (!slugs.includes(slug)) return null
			try {
				return { slug, locale, markdown: strip(await load()) } satisfies Doc
			} catch {
				// A half-written translation must not take the docs page down.
				console.warn(`docs: could not read ${path}`)
				return null
			}
		}),
	)
	const bySlugTranslated = new Map(loaded.filter((doc): doc is Doc => doc !== null).map((doc) => [doc.slug, doc]))
	return docs.map((doc) => bySlugTranslated.get(doc.slug) ?? doc)
}
