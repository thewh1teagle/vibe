import type { CatalogModel } from './model-catalog'

/**
 * `vibe://download/?url=<address>` — how the website and third-party pages (ivrit.ai among them)
 * hand a model to the app. macOS delivers it through the deep-link plugin, Windows and Linux as a
 * command-line argument; both go through `parseDownloadLink` so they cannot drift apart.
 */
const LINK_PREFIXES = ['vibe://download/?', 'vibe://download?']

/** Hosts a model outside the catalog may come from, matched exactly — no subdomains. */
export const UNVERIFIED_MODEL_HOSTS = ['huggingface.co', 'github.com']

export type DownloadLink =
	/** A catalog model (or one of its mirrors): downloaded with its size and hash pinned, then selected. */
	| { kind: 'catalog'; url: string; model: CatalogModel }
	/** A file on an allowed host the catalog does not know: shown in full, downloaded unverified, not selected. */
	| { kind: 'unverified'; url: string }
	| { kind: 'refused'; reason: 'invalid' | 'insecure' | 'host'; url: string | null }

export function isDownloadLink(value: string): boolean {
	const lower = value.trim().toLowerCase()
	return LINK_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

/**
 * The address inside a download link. Everything after `url=` is taken verbatim, as the macOS
 * handler always has: the website does not encode the address, and a query string inside it
 * (`?download=true`) must survive. An address that arrives percent-encoded is decoded once.
 */
export function extractDownloadUrl(link: string): string | null {
	if (!isDownloadLink(link)) return null
	const trimmed = link.trim()
	const query = trimmed.slice(trimmed.indexOf('?') + 1)
	const marker = query.startsWith('url=') ? 0 : query.indexOf('&url=') + 1
	if (marker === 0 && !query.startsWith('url=')) return null
	let value = query.slice(marker + 'url='.length).trim()
	if (/^https?%3a/i.test(value)) {
		try {
			value = decodeURIComponent(value)
		} catch {
			return null
		}
	}
	return value || null
}

function sameFile(a: URL, candidate: string) {
	try {
		const b = new URL(candidate)
		return a.hostname === b.hostname && a.pathname === b.pathname
	} catch {
		return false
	}
}

/** Decide what a download address may do. Pure: no I/O, so both entry points and the tests share it. */
export function classifyDownloadUrl(raw: string | null, models: CatalogModel[]): DownloadLink {
	if (!raw) return { kind: 'refused', reason: 'invalid', url: null }
	let url: URL
	try {
		url = new URL(raw)
	} catch {
		return { kind: 'refused', reason: 'invalid', url: raw }
	}
	if (url.protocol !== 'https:') return { kind: 'refused', reason: 'insecure', url: raw }
	if (url.username || url.password || url.port) return { kind: 'refused', reason: 'host', url: raw }

	const model = models.find((entry) => [entry.url, ...entry.mirrors].some((candidate) => sameFile(url, candidate)))
	if (model) return { kind: 'catalog', url: url.href, model }
	if (UNVERIFIED_MODEL_HOSTS.includes(url.hostname)) return { kind: 'unverified', url: url.href }
	return { kind: 'refused', reason: 'host', url: raw }
}

export function parseDownloadLink(link: string, models: CatalogModel[]): DownloadLink {
	return classifyDownloadUrl(extractDownloadUrl(link), models)
}
